// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#include "AfterimageDocumentBridge.h"
#include <QBuffer>
#include <QDir>
#include <QSaveFile>
#include <QFutureWatcher>
#include <QJsonDocument>
#include <QPointer>
#include <QTimer>
#include <QUuid>
#include <QtConcurrentRun>
#include <KisDocument.h>
#include <kis_group_layer.h>
#include <kis_image.h>
#include <kis_paint_device.h>
#include <kis_processing_applicator.h>
#include <kis_selection.h>
#include <commands/KisNodeRenameCommand.h>
#include <commands/kis_node_opacity_command.h>
#include <klocalizedstring.h>
#include <chrono>
#include <memory>

namespace {
QJsonArray textResult(const QJsonObject &result)
{
    return {QJsonObject{{"type", "inputText"}, {"text", QString::fromUtf8(QJsonDocument(result).toJson(QJsonDocument::Compact))}}};
}
QJsonObject spec(const QString &name, const QString &description, const QJsonObject &properties, const QJsonArray &required = {})
{
    return {{"type", "function"}, {"name", name}, {"description", description},
        {"inputSchema", QJsonObject{{"type", "object"}, {"properties", properties}, {"required", required}, {"additionalProperties", false}}}};
}
KisNodeSP findNode(KisNodeSP parent, const QString &id)
{
    for (auto node = parent->firstChild(); node; node = node->nextSibling()) {
        if (node->uuid().toString(QUuid::WithoutBraces) == id) return node;
        if (auto child = findNode(node, id)) return child;
    }
    return {};
}
QJsonArray preview(KisPaintDeviceSP pixels, const QRect &rect, int edge, const QString &root)
{
    // The snapshot owns shared tiles; decoding touches only the requested view.
    const QImage image = rect.width() <= edge && rect.height() <= edge
        ? pixels->convertToQImage(nullptr, rect)
        : pixels->createThumbnailUncached(edge, edge, rect);
    QByteArray png;
    QBuffer buffer(&png);
    if (image.isNull() || !buffer.open(QIODevice::WriteOnly) || !image.save(&buffer, "PNG")) return {};
    if (!QDir().mkpath(root)) return {};
    const QString path = root + '/' + QUuid::createUuid().toString(QUuid::WithoutBraces) + ".png";
    QSaveFile file(path);
    if (!file.open(QIODevice::WriteOnly) || file.write(png) != png.size() || !file.commit()) return {};
    QJsonArray result = textResult({{"sourceRect", QJsonArray{rect.x(), rect.y(), rect.width(), rect.height()}},
        {"previewWidth", image.width()}, {"previewHeight", image.height()}, {"previewPath", path}});
    result.append(QJsonObject{{"type", "inputImage"}, {"imageUrl", QString("data:image/png;base64," + QString::fromLatin1(png.toBase64()))}});
    return result;
}
}

QJsonArray AfterimageDocumentBridge::tools()
{
    return {
        spec("afterimage_preview", "See the bound artwork or current selection. Returns an image with document coordinates; original artwork stays at full resolution.",
            {{"scope", QJsonObject{{"type", "string"}, {"enum", QJsonArray{"canvas", "selection"}}}},
             {"maxEdge", QJsonObject{{"type", "integer"}, {"minimum", 64}, {"maximum", 4096}}}}),
        spec("afterimage_layer_properties", "Change a layer name or opacity in the bound artwork using native undo history. Use the layer id from afterimage_document. Returns only after the document operation finishes.",
            {{"layerId", QJsonObject{{"type", "string"}}}, {"name", QJsonObject{{"type", "string"}}},
             {"opacity", QJsonObject{{"type", "integer"}, {"minimum", 0}, {"maximum", 255}}}}, {"layerId"})
    };
}

void AfterimageDocumentBridge::invoke(KisDocument *document, const QString &tool, const QJsonObject &arguments, Reply reply)
{
    if (!document || !document->image()) { reply(false, textResult({{"error", "The bound artwork is closed."}})); return; }
    const QPointer<KisDocument> owner(document);
    const int epoch = m_epoch;
    auto *timer = new QTimer(this);
    timer->setInterval(30);
    // Wait for the native scheduler without stopping canvas input or changing the target document.
    connect(timer, &QTimer::timeout, this, [this, timer, owner, epoch, tool, arguments, reply] {
        if (epoch != m_epoch) { timer->stop(); timer->deleteLater(); return; }
        if (!owner || !owner->image()) {
            timer->stop(); timer->deleteLater();
            reply(false, textResult({{"error", "The bound artwork is closed."}})); return;
        }
        KisImageSP image = owner->image();
        if (!image->tryBarrierLock(true)) return;
        timer->stop(); timer->deleteLater();
        if (tool == "afterimage_preview") {
            QRect rect = image->bounds();
            if (arguments["scope"] == "selection") {
                const auto selection = image->globalSelection();
                if (!selection || selection->selectedExactRect().isEmpty()) {
                    image->unlock(); reply(false, textResult({{"error", "There is no selection."}})); return;
                }
                rect = rect.intersected(selection->selectedExactRect());
            }
            if (rect.isEmpty()) { image->unlock(); reply(false, textResult({{"error", "The selected area is outside the canvas."}})); return; }
            const KisPaintDeviceSP pixels = new KisPaintDevice(*image->projection());
            image->unlock();
            const int edge = qBound(64, arguments["maxEdge"].toInt(1536), 4096);
            auto *watcher = new QFutureWatcher<QJsonArray>(this);
            connect(watcher, &QFutureWatcher<QJsonArray>::finished, this, [this, watcher, epoch, reply] {
                const auto result = watcher->result(); watcher->deleteLater();
                if (epoch == m_epoch) reply(!result.isEmpty(), result.isEmpty() ? textResult({{"error", "The artwork preview could not be rendered."}}) : result);
            });
            watcher->setFuture(QtConcurrent::run(preview, pixels, rect, edge, QString(m_artifactRoot + "/inputs")));
            return;
        }
        const auto node = findNode(image->rootLayer(), arguments["layerId"].toString());
        if (tool != "afterimage_layer_properties" || !node || (!arguments.contains("name") && !arguments.contains("opacity"))) {
            image->unlock(); reply(false, textResult({{"error", "Choose an existing layer and a name or opacity to change."}})); return;
        }
        const QString oldName = node->name();
        image->unlock();
        KisProcessingApplicator operation(image, KisNodeSP(), KisProcessingApplicator::NONE, {}, kundo2_i18n("Edit layer with Afterimage"));
        if (arguments.contains("name")) operation.applyCommand(new KisNodeRenameCommand(node, oldName, arguments["name"].toString()));
        if (arguments.contains("opacity")) operation.applyCommand(new KisNodeOpacityCommand(node, qBound(0, arguments["opacity"].toInt(), 255)));
        auto completion = std::make_shared<std::future<bool>>(operation.successfullyCompletedFuture());
        operation.end();
        auto *finished = new QTimer(this);
        finished->setInterval(30);
        connect(finished, &QTimer::timeout, this, [this, finished, completion, epoch, owner, node, reply] {
            if (completion->wait_for(std::chrono::seconds(0)) != std::future_status::ready) return;
            const bool succeeded = completion->get();
            finished->stop(); finished->deleteLater();
            if (epoch != m_epoch) return;
            if (!succeeded || !owner) reply(false, textResult({{"error", "The document operation was cancelled."}}));
            else reply(true, textResult({{"status", "completed"}, {"layerId", node->uuid().toString(QUuid::WithoutBraces)},
                {"name", node->name()}, {"opacity", node->opacity()}}));
        });
        finished->start();
    });
    timer->start();
}
