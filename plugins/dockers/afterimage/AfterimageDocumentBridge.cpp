// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#include "AfterimageDocumentBridge.h"
#include "TempleToolGateway.h"
#include "ArtistToolGateway.h"
#include <QBuffer>
#include <QColor>
#include <QDir>
#include <QFileInfo>
#include <QFile>
#include <QSaveFile>
#include <QFutureWatcher>
#include <QJsonDocument>
#include <QPointer>
#include <QTimer>
#include <QUuid>
#include <QtConcurrentRun>
#include <KisDocument.h>
#include <KisPart.h>
#include <KoColorSpaceRegistry.h>
#include <KoShapeControllerBase.h>
#include <commands/KoShapeCreateCommand.h>
#include <flake/kis_shape_layer.h>
#include <kis_group_layer.h>
#include <kis_image.h>
#include <kis_paint_device.h>
#include <kis_paint_device_writer.h>
#include <kis_pixel_selection.h>
#include <kis_node_facade.h>
#include <kis_paint_layer.h>
#include <kis_transparency_mask.h>
#include <kis_transform_worker.h>
#include <kis_filter_strategy.h>
#include <KoColor.h>
#include <KoColorSpaceRegistry.h>
#include <commands/kis_image_layer_add_command.h>
#include <commands/kis_image_layer_remove_command.h>
#include <kis_processing_applicator.h>
#include <kis_selection.h>
#include <commands/KisNodeRenameCommand.h>
#include <commands/kis_node_opacity_command.h>
#include <klocalizedstring.h>
#include <chrono>
#include <memory>
#include <kundo2stack.h>

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
void appendLayerPage(KisNodeSP parent, int offset, int limit, int &seen, QJsonArray &page)
{
    for (auto node = parent->lastChild(); node; node = node->prevSibling()) {
        if (seen >= offset && page.size() < limit) {
            page.append(QJsonObject{{"id", node->uuid().toString(QUuid::WithoutBraces)},
                {"parentId", parent->uuid().toString(QUuid::WithoutBraces)},
                {"name", node->name().left(160)}, {"type", node->metaObject()->className()},
                {"visible", node->visible()}, {"opacity", node->opacity()}, {"children", int(node->childCount())}});
        }
        ++seen;
        if (node->childCount()) appendLayerPage(node, offset, limit, seen, page);
    }
}
QJsonObject rectJson(const QRect &rect)
{
    return {{"x", rect.x()}, {"y", rect.y()}, {"width", rect.width()}, {"height", rect.height()}};
}
QJsonObject readCandidate(const QString &root, const QString &id)
{
    const QUuid candidateId(id);
    if (candidateId.isNull()) return {{"error", "Invalid candidate ID."}};
    const QString folder = root + "/candidates/" + candidateId.toString(QUuid::WithoutBraces);
    QFile file(folder + "/candidate.json");
    if (!file.open(QIODevice::ReadOnly)) return {{"error", "The retained candidate was not found."}};
    const auto candidate = QJsonDocument::fromJson(file.readAll()).object();
    if (candidate["id"].toString() != candidateId.toString(QUuid::WithoutBraces)
        || QFileInfo(candidate["path"].toString()).canonicalFilePath() != QFileInfo(folder + "/image.png").canonicalFilePath())
        return {{"error", "The candidate metadata does not match its retained image."}};
    return candidate;
}
class TileWriter : public KisPaintDeviceWriter
{
public:
    explicit TileWriter(QIODevice &file) : m_file(file) {}
    bool write(const QByteArray &data) override { return m_file.write(data) == data.size(); }
    bool write(const char *data, qint64 length) override { return m_file.write(data, length) == length; }
private:
    QIODevice &m_file;
};
QJsonArray preview(KisPaintDeviceSP pixels, KisPaintDeviceSP mask, const QRect &rect, int edge, const QString &root, bool prepared)
{
    // The snapshot owns shared tiles; decoding touches only the requested view.
    const QSize previewSize = rect.size().scaled(QSize(edge, edge), Qt::KeepAspectRatio);
    const QImage image = rect.width() <= edge && rect.height() <= edge
        ? pixels->convertToQImage(nullptr, rect)
        : pixels->createThumbnailUncached(previewSize.width(), previewSize.height(), rect);
    QByteArray png;
    QBuffer buffer(&png);
    if (image.isNull() || !buffer.open(QIODevice::WriteOnly) || !image.save(&buffer, "PNG")) return {};
    if (!QDir().mkpath(root)) return {};
    const QString path = root + '/' + QUuid::createUuid().toString(QUuid::WithoutBraces) + ".png";
    QSaveFile file(path);
    if (!file.open(QIODevice::WriteOnly) || file.write(png) != png.size() || !file.commit()) return {};
    QJsonObject metadata{{"sourceRect", QJsonArray{rect.x(), rect.y(), rect.width(), rect.height()}},
        {"previewWidth", image.width()}, {"previewHeight", image.height()}, {"previewPath", path}};
    if (prepared) metadata["placement"] = "sourceRect";
    if (mask) {
        QSaveFile maskFile(path + ".mask");
        TileWriter writer(maskFile);
        if (!maskFile.open(QIODevice::WriteOnly) || !mask->write(writer) || !maskFile.commit()) return {};
        metadata["maskPath"] = maskFile.fileName();
        metadata["maskX"] = mask->x();
        metadata["maskY"] = mask->y();
        metadata["maskDefault"] = int(mask->defaultPixel().data()[0]);
    }
    // Dynamic tool results can be composed as text by the app-server harness.
    // Return a file reference, never a data URI that could become hundreds of thousands of text tokens.
    return textResult(metadata);
}
}

AfterimageDocumentBridge::AfterimageDocumentBridge(const QString &artifactRoot, QObject *parent)
    : QObject(parent), m_artifactRoot(artifactRoot), m_templeGateway(new TempleToolGateway(this)),
      m_artistGateway(new ArtistToolGateway(this)) {}

QJsonArray AfterimageDocumentBridge::tools()
{
    QJsonArray nativeTools{
        spec("afterimage_document", "Inspect the bound native artwork. Returns bounded layer pages; use offset/limit for more, or layerId for one layer. No image bytes are returned.",
            {{"offset", QJsonObject{{"type", "integer"}, {"minimum", 0}}},
             {"limit", QJsonObject{{"type", "integer"}, {"minimum", 1}, {"maximum", 80}}},
             {"layerId", QJsonObject{{"type", "string"}}}}),
        spec("afterimage_create_document", "Create a blank native Afterimage document bound to this turn without changing the artist's current tab, tool or focus.",
            {{"title", QJsonObject{{"type", "string"}}}, {"width", QJsonObject{{"type", "integer"}, {"minimum", 1}}},
             {"height", QJsonObject{{"type", "integer"}, {"minimum", 1}}},
             {"background", QJsonObject{{"type", "string"}, {"description", "CSS hex color, for example #ffffff or #00000000."}}}},
            {"title", "width", "height"}),
        spec("afterimage_svg_layer", "Add or replace one editable native vector layer containing SVG shapes and text. To replace, provide an existing vector layerId. This changes only that layer and uses one undo command.",
            {{"name", QJsonObject{{"type", "string"}}}, {"svg", QJsonObject{{"type", "string"}}},
             {"layerId", QJsonObject{{"type", "string"}}}}, {"name", "svg"}),
        spec("afterimage_candidates", "List retained generated images with bounded metadata and IDs. Use afterimage_place_candidate to apply an authorized result.",
            {{"limit", QJsonObject{{"type", "integer"}, {"minimum", 1}, {"maximum", 40}}},
             {"includeOtherArtworks", QJsonObject{{"type", "boolean"}}}}),
        spec("afterimage_wait_candidate", "Wait for one current image-generation item to finish being retained, then return its candidate ID or its actual failure. Call once with the imageGeneration item ID; no polling is needed.",
            {{"itemId", QJsonObject{{"type", "string"}}}}, {"itemId"}),
        spec("afterimage_place_candidate", "Apply a retained candidate to the bound native artwork as one undoable layer and captured selection mask. Use only when the artist authorized application.",
            {{"candidateId", QJsonObject{{"type", "string"}}},
             {"alignToSource", QJsonObject{{"type", "boolean"}}}, {"nearest", QJsonObject{{"type", "boolean"}}}}, {"candidateId"}),
        spec("afterimage_undo", "Undo the current top native history entry on the bound document if its index still matches the inspected history. This can undo an artist operation when requested; inspect the history first.",
            {{"expectedIndex", QJsonObject{{"type", "integer"}, {"minimum", 1}}}}, {"expectedIndex"}),
        spec("afterimage_save", "Save the bound artwork as a native editable KRA document. Completes after Krita's native background save finishes.",
            {{"path", QJsonObject{{"type", "string"}}}}, {"path"}),
        spec("afterimage_export_png", "Export a PNG snapshot of the bound artwork using Krita's native background export.",
            {{"path", QJsonObject{{"type", "string"}}}}, {"path"}),
        spec("afterimage_preview", "Prepare a preview of the bound artwork or current selection. Returns a local PNG previewPath with document coordinates. Open that file with view_image to see it; original artwork stays at full resolution.",
            {{"scope", QJsonObject{{"type", "string"}, {"enum", QJsonArray{"canvas", "selection"}}}},
             {"maxEdge", QJsonObject{{"type", "integer"}, {"minimum", 64}, {"maximum", 4096}}}}),
        spec("afterimage_prepare_edit", "Capture the selected area or canvas for image editing. Returns the source PNG path, document coordinates and an immutable native selection mask. Preserve the crop's framing; request genuine transparent foreground for additions, or a full edited crop for replacements. Afterimage retains and places candidates with the captured mask; do not edit document files externally.",
            {{"scope", QJsonObject{{"type", "string"}, {"enum", QJsonArray{"canvas", "selection"}}}}}, {"scope"}),
        spec("afterimage_layer_properties", "Change a layer name or opacity in the bound artwork using native undo history. Use the layer id from afterimage_document. Returns only after the document operation finishes.",
            {{"layerId", QJsonObject{{"type", "string"}}}, {"name", QJsonObject{{"type", "string"}}},
             {"opacity", QJsonObject{{"type", "integer"}, {"minimum", 0}, {"maximum", 255}}}}, {"layerId"})
    };
    for (const QJsonValue &tool : TempleToolGateway::tools()) nativeTools.append(tool);
    for (const QJsonValue &tool : ArtistToolGateway::tools()) nativeTools.append(tool);
    return nativeTools;
}

QJsonObject AfterimageDocumentBridge::documentSummary(KisDocument *document, int offset, int limit, const QString &layerId)
{
    if (!document || !document->image()) return {{"open", false}};
    const KisImageSP image = document->image();
    if (!document->property("afterimageId").isValid())
        document->setProperty("afterimageId", QUuid::createUuid().toString(QUuid::WithoutBraces));
    QJsonObject result{{"open", true}, {"documentId", document->property("afterimageId").toString()},
        {"title", document->caption().left(200)}, {"filePath", document->localFilePath()},
        {"width", image->width()}, {"height", image->height()}};
    if (const auto *stack = document->undoStack())
        result["history"] = QJsonObject{{"index", stack->index()}, {"canUndo", stack->canUndo()},
            {"undoText", stack->undoText().left(160)}, {"canRedo", stack->canRedo()},
            {"redoText", stack->redoText().left(160)}};
    const auto selection = image->globalSelection();
    if (selection) result["selectionBounds"] = rectJson(selection->selectedExactRect());
    if (!layerId.isEmpty()) {
        const auto node = findNode(image->rootLayer(), layerId);
        result["layer"] = node ? QJsonObject{{"id", layerId}, {"name", node->name().left(500)},
            {"type", node->metaObject()->className()}, {"visible", node->visible()},
            {"opacity", node->opacity()}, {"children", int(node->childCount())}}
            : QJsonObject{{"error", "Layer not found."}};
        return result;
    }
    int seen = 0;
    QJsonArray page;
    const int safeOffset = qMax(0, offset);
    const int safeLimit = qBound(1, limit, 80);
    appendLayerPage(image->rootLayer(), safeOffset, safeLimit, seen, page);
    result["layers"] = page;
    result["layerOffset"] = safeOffset;
    result["layerCount"] = seen;
    if (safeOffset + page.size() < seen) result["nextLayerOffset"] = safeOffset + page.size();
    return result;
}

void AfterimageDocumentBridge::bindDocument(KisDocument *document)
{
    cancelPending();
    for (auto waiters : m_candidateWaiters) for (const auto &reply : waiters)
        reply(false, textResult({{"error", "The conversation moved to another artwork."}}));
    m_candidateWaiters.clear();
    m_pendingCandidates.clear();
    m_recentCandidateIds.clear();
    m_readyCandidates.clear();
    m_failedCandidates.clear();
    m_boundDocument = document;
}

KisDocument *AfterimageDocumentBridge::boundDocument() const
{
    return m_boundDocument.data();
}

void AfterimageDocumentBridge::markCandidatePending(const QString &itemId)
{
    if (!itemId.isEmpty()) m_pendingCandidates.insert(itemId);
}

void AfterimageDocumentBridge::markCandidateReady(const QJsonObject &candidate)
{
    const QString itemId = candidate["itemId"].toString();
    if (itemId.isEmpty() || !m_pendingCandidates.remove(itemId)) return;
    m_readyCandidates.insert(itemId, candidate);
    m_recentCandidateIds.insert(candidate["id"].toString());
    for (const auto &reply : m_candidateWaiters.take(itemId))
        reply(true, textResult({{"status", "retained"}, {"itemId", itemId}, {"candidateId", candidate["id"]},
            {"width", candidate["width"]}, {"height", candidate["height"]}}));
}

void AfterimageDocumentBridge::markCandidateFailed(const QString &itemId, const QString &error)
{
    if (itemId.isEmpty() || !m_pendingCandidates.remove(itemId)) return;
    m_failedCandidates.insert(itemId, error.left(1000));
    for (const auto &reply : m_candidateWaiters.take(itemId))
        reply(false, textResult({{"status", "failed"}, {"itemId", itemId}, {"error", error.left(1000)}}));
}

void AfterimageDocumentBridge::invoke(KisDocument *document, const QString &tool, const QJsonObject &arguments, Reply reply)
{
    if (m_boundDocument && document && document != m_boundDocument) {
        reply(false, textResult({{"error", "This turn is bound to a different artwork."}})); return;
    }
    if (!document) document = m_boundDocument.data();
    if (document && !m_boundDocument) m_boundDocument = document;
    if (tool.startsWith("afterimage_temple_")) {
        m_templeGateway->invoke(document, tool, arguments,
            [reply](bool success, const QJsonObject &result) { reply(success, textResult(result)); });
        return;
    }
    if (tool.startsWith("afterimage_artist_")) {
        m_artistGateway->invoke(document, tool, arguments,
            [reply](bool success, const QJsonObject &result) { reply(success, textResult(result)); });
        return;
    }
    if (tool == "afterimage_create_document") {
        // Creation is an explicit request for a new artwork. Keep the previous
        // document open and switch only this agent binding, never the UI view.
        const int width = arguments["width"].toInt(), height = arguments["height"].toInt();
        if (width < 1 || height < 1) {
            reply(false, textResult({{"error", "Choose positive canvas dimensions."}})); return;
        }
        const QColor background(arguments["background"].toString("#ffffffff"));
        if (!background.isValid()) { reply(false, textResult({{"error", "Use a valid hex background color."}})); return; }
        auto *created = KisPart::instance()->createDocument();
        const auto *space = KoColorSpaceRegistry::instance()->rgb8();
        const QString title = arguments["title"].toString().trimmed().left(160);
        if (!created->newImage(title.isEmpty() ? tr("Untitled artwork") : title, width, height,
                space, KoColor(background, space), KisConfig::RASTER_LAYER, 1, "", 96)) {
            delete created; reply(false, textResult({{"error", "The native document could not be created."}})); return;
        }
        created->setObjectName(title);
        created->setProperty("afterimageId", QUuid::createUuid().toString(QUuid::WithoutBraces));
        KisPart::instance()->addDocument(created);
        m_boundDocument = created;
        reply(true, textResult(documentSummary(created)));
        return;
    }
    if (tool == "afterimage_candidates") {
        QJsonArray candidates;
        QJsonArray pending;
        for (const QString &itemId : m_pendingCandidates) pending.append(itemId);
        const QDir directory(m_artifactRoot + "/candidates");
        const int limit = qBound(1, arguments["limit"].toInt(20), 40);
        const QString boundId = document && document->image() ? documentSummary(document, 0, 1)["documentId"].toString() : QString();
        const bool includeOther = arguments["includeOtherArtworks"].toBool(false);
        for (const QFileInfo &folder : directory.entryInfoList(QDir::Dirs | QDir::NoDotAndDotDot, QDir::Time)) {
            if (candidates.size() >= limit) break;
            const QJsonObject item = readCandidate(m_artifactRoot, folder.fileName());
            if (item.contains("error")) continue;
            if (!includeOther && !m_recentCandidateIds.contains(item["id"].toString())
                && (boundId.isEmpty() || item["source"].toObject()["documentId"].toString() != boundId)) continue;
            candidates.append(QJsonObject{{"id", item["id"]}, {"provider", item["provider"]},
                {"model", item["model"]}, {"created", item["created"]},
                {"width", item["width"]}, {"height", item["height"]},
                {"prompt", item["prompt"].toString().left(500)},
                {"sourceDocumentId", item["source"].toObject()["documentId"]},
                {"itemId", item["itemId"]}, {"threadId", item["threadId"]}});
        }
        reply(true, textResult({{"candidates", candidates}, {"pendingItemIds", pending}}));
        return;
    }
    if (tool == "afterimage_wait_candidate") {
        const QString itemId = arguments["itemId"].toString();
        if (m_readyCandidates.contains(itemId)) {
            const QJsonObject candidate = m_readyCandidates[itemId];
            reply(true, textResult({{"status", "retained"}, {"candidateId", candidate["id"]}, {"itemId", itemId}}));
        } else if (m_failedCandidates.contains(itemId)) {
            reply(false, textResult({{"status", "failed"}, {"error", m_failedCandidates[itemId]}, {"itemId", itemId}}));
        } else if (m_pendingCandidates.contains(itemId)) m_candidateWaiters[itemId].append(reply);
        else reply(false, textResult({{"error", "This image-generation item is not pending in this conversation."}}));
        return;
    }
    if (!document || !document->image()) { reply(false, textResult({{"error", "The bound artwork is closed."}})); return; }
    if (tool == "afterimage_document") {
        reply(true, textResult(documentSummary(document, arguments["offset"].toInt(),
            arguments["limit"].toInt(40), arguments["layerId"].toString())));
        return;
    }
    if (tool == "afterimage_place_candidate") {
        const QJsonObject candidate = readCandidate(m_artifactRoot, arguments["candidateId"].toString());
        if (candidate.contains("error")) { reply(false, textResult(candidate)); return; }
        place(document, candidate, arguments["alignToSource"].toBool(true), arguments["nearest"].toBool(false), reply);
        return;
    }
    if (tool == "afterimage_undo") {
        const QPointer<KisDocument> owner(document);
        KisImageSP image = document->image();
        const int expectedIndex = arguments["expectedIndex"].toInt(-1);
        auto *finished = new QTimer(this);
        finished->setInterval(30);
        auto undoStarted = std::make_shared<bool>(false);
        connect(finished, &QTimer::timeout, this, [finished, owner, image, expectedIndex, undoStarted, reply]() mutable {
            if (!owner || owner->image().data() != image.data()) {
                finished->stop(); finished->deleteLater();
                reply(false, textResult({{"error", "The artwork closed while undo was pending."}})); return;
            }
            if (!image->tryBarrierLock(true)) return;
            image->unlock();
            auto *stack = owner->undoStack();
            if (!*undoStarted) {
                // A stroke can commit while the artist paints. Check history only
                // after the native scheduler is quiescent, immediately before undo.
                if (!stack || !stack->canUndo() || stack->index() != expectedIndex) {
                    finished->stop(); finished->deleteLater();
                    reply(false, textResult({{"error", "The document history changed; inspect it again before undoing."},
                        {"expectedIndex", expectedIndex}, {"currentIndex", stack ? stack->index() : -1},
                        {"canUndo", stack && stack->canUndo()}})); return;
                }
                *undoStarted = true;
                stack->undo();
                return;
            }
            finished->stop(); finished->deleteLater();
            const int currentIndex = stack->index();
            reply(currentIndex == expectedIndex - 1, textResult(currentIndex == expectedIndex - 1
                ? QJsonObject{{"status", "completed"}, {"historyIndex", currentIndex}}
                : QJsonObject{{"error", "Another history operation interleaved with undo; inspect the artwork."}}));
        });
        finished->start();
        return;
    }
    if (tool == "afterimage_save" || tool == "afterimage_export_png") {
        const QString path = QFileInfo(arguments["path"].toString()).absoluteFilePath();
        const QString suffix = tool == "afterimage_save" ? ".kra" : ".png";
        if (arguments["path"].toString().isEmpty() || !path.endsWith(suffix, Qt::CaseInsensitive)
            || !QFileInfo(path).dir().exists()) {
            const QString error = QStringLiteral("Choose an existing folder and a path ending in ") + suffix;
            reply(false, textResult({{"error", error}})); return;
        }
        if (document->isSaving()) {
            reply(false, textResult({{"error", "A native save is already in progress for this artwork."}})); return;
        }
        const QPointer<KisDocument> owner(document);
        const bool priorBatchMode = document->fileBatchMode();
        auto done = std::make_shared<bool>(false);
        auto connection = std::make_shared<QMetaObject::Connection>();
        auto complete = [owner, path, done, connection, priorBatchMode, reply](bool success, const QString &error) {
            if (*done) return;
            *done = true;
            QObject::disconnect(*connection);
            if (owner) owner->setFileBatchMode(priorBatchMode);
            reply(success && owner, textResult(success && owner ? QJsonObject{{"status", "completed"}, {"path", path}}
                : QJsonObject{{"error", error.isEmpty() ? "The document save or export failed." : error}}));
        };
        *connection = connect(document, &KisDocument::sigCompleteBackgroundSaving, this,
            [path, complete](const KritaUtils::ExportFileJob &job, KisImportExportErrorCode status,
                             const QString &error, const QString &) {
                if (QFileInfo(job.filePath).absoluteFilePath() == path) complete(status.isOk(), error);
            });
        document->setFileBatchMode(true);
        const bool started = tool == "afterimage_save"
            ? document->saveAs(path, "application/x-krita", false)
            : document->exportDocument(path, "image/png", false, false);
        if (!started) complete(false, tr("The native background save could not start."));
        return;
    }
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
        if (tool == "afterimage_svg_layer") {
            const QString svgText = arguments["svg"].toString();
            const QString lowered = svgText.toLower();
            if (svgText.size() > 262144 || !lowered.contains("<svg") || lowered.contains("<!")
                || lowered.contains("<script") || lowered.contains("foreignobject") || lowered.contains("href=")
                || lowered.contains("url(")) {
                image->unlock(); reply(false, textResult({{"error", "Provide a self-contained SVG of at most 256 KB, without scripts or external resources."}})); return;
            }
            const QString targetId = arguments["layerId"].toString();
            KisNodeSP oldNode;
            if (!targetId.isEmpty()) {
                oldNode = findNode(image->rootLayer(), targetId);
                if (!oldNode || !dynamic_cast<KisShapeLayer *>(oldNode.data())) {
                    image->unlock(); reply(false, textResult({{"error", "The target is not an existing editable vector layer."}})); return;
                }
            }
            QByteArray bytes = svgText.toUtf8();
            QBuffer input(&bytes); input.open(QIODevice::ReadOnly);
            QStringList warnings, errors;
            const auto shapes = KisShapeLayer::createShapesFromSvg(&input, {}, image->bounds(), image->xRes() * 72.0,
                owner->shapeController()->resourceManager(), false, nullptr, &warnings, &errors);
            if (shapes.isEmpty() || !errors.isEmpty()) {
                qDeleteAll(shapes); image->unlock();
                const QString error = QStringLiteral("SVG could not be converted into editable native shapes: ") + errors.join("; ").left(500);
                reply(false, textResult({{"error", error}})); return;
            }
            const QString name = arguments["name"].toString().trimmed().left(160);
            KisShapeLayerSP layer = new KisShapeLayer(owner->shapeController(), image,
                name.isEmpty() ? tr("Afterimage art") : name, 255);
            if (oldNode) {
                layer->setUuid(oldNode->uuid());
                layer->setOpacity(oldNode->opacity());
                layer->setVisible(oldNode->visible());
                layer->setUserLocked(oldNode->userLocked());
                layer->setCompositeOpId(oldNode->compositeOpId());
                if (auto *oldLayer = dynamic_cast<KisLayer *>(oldNode.data())) layer->setChannelFlags(oldLayer->channelFlags());
            }
            KisNodeSP parent = oldNode ? oldNode->parent() : KisNodeSP(image->rootLayer());
            KisNodeSP above = oldNode ? oldNode->prevSibling() : parent->lastChild();
            image->unlock();
            KisProcessingApplicator operation(image, KisNodeSP(), KisProcessingApplicator::NONE, {}, kundo2_i18n("Afterimage vector edit"));
            if (oldNode) operation.applyCommand(new KisImageLayerRemoveCommand(image, oldNode), KisStrokeJobData::BARRIER, KisStrokeJobData::EXCLUSIVE);
            operation.applyCommand(new KisImageLayerAddCommand(image, layer, parent, above,
                KisImageLayerAddCommand::DoRedoUpdates | KisImageLayerAddCommand::DoUndoUpdates | KisImageLayerAddCommand::DontActivateOnAddition),
                KisStrokeJobData::BARRIER, KisStrokeJobData::EXCLUSIVE);
            operation.applyCommand(new KoShapeCreateCommand(owner->shapeController(), shapes, layer.data()),
                KisStrokeJobData::BARRIER, KisStrokeJobData::EXCLUSIVE);
            auto completion = std::make_shared<std::future<bool>>(operation.successfullyCompletedFuture());
            operation.end();
            auto *finished = new QTimer(this); finished->setInterval(30);
            connect(finished, &QTimer::timeout, this, [this, finished, completion, epoch, owner, layer, reply]() mutable {
                if (completion->wait_for(std::chrono::seconds(0)) != std::future_status::ready) return;
                const bool succeeded = completion->get(); finished->stop(); finished->deleteLater();
                if (epoch != m_epoch) return;
                if (!succeeded || !owner || !owner->image()) {
                    reply(false, textResult({{"error", "The native vector edit did not complete."}})); return;
                }
                // An offscreen shape layer has no canvas view to request its first
                // projection. Explicitly render the native graph before reporting it.
                KisImageSP image = owner->image();
                layer->forceUpdateHiddenAreaOnOriginal();
                image->refreshGraphAsync();
                auto *rendered = new QTimer(this); rendered->setInterval(30);
                connect(rendered, &QTimer::timeout, this, [this, rendered, owner, image, epoch, layer, reply]() mutable {
                    if (epoch != m_epoch || !owner || owner->image().data() != image.data()) {
                        rendered->stop(); rendered->deleteLater();
                        reply(false, textResult({{"error", "The artwork changed while its vector layer rendered."}})); return;
                    }
                    if (!image->tryBarrierLock(true)) return;
                    image->unlock(); rendered->stop(); rendered->deleteLater();
                    reply(true, textResult({{"status", "completed"},
                        {"layerId", layer->uuid().toString(QUuid::WithoutBraces)}, {"name", layer->KisNode::name()}}));
                });
                rendered->start();
            });
            finished->start();
            return;
        }
        if (tool == "afterimage_preview" || tool == "afterimage_prepare_edit") {
            const bool prepared = tool == "afterimage_prepare_edit";
            KisPaintDeviceSP mask;
            QRect rect = image->bounds();
            if (arguments["scope"] == "selection") {
                const auto selection = image->globalSelection();
                if (!selection || selection->selectedExactRect().isEmpty()) {
                    image->unlock(); reply(false, textResult({{"error", "There is no selection."}})); return;
                }
                rect = rect.intersected(selection->selectedExactRect());
                if (prepared) mask = new KisPaintDevice(*selection->projection());
            }
            if (rect.isEmpty()) { image->unlock(); reply(false, textResult({{"error", "The selected area is outside the canvas."}})); return; }
            const KisPaintDeviceSP pixels = new KisPaintDevice(*image->projection());
            const QSize canvasSize = image->size();
            image->unlock();
            const int edge = prepared ? 4096 : qBound(64, arguments["maxEdge"].toInt(1536), 4096);
            auto *watcher = new QFutureWatcher<QJsonArray>(this);
            connect(watcher, &QFutureWatcher<QJsonArray>::finished, this, [this, watcher, epoch, reply] {
                const auto result = watcher->result(); watcher->deleteLater();
                if (epoch == m_epoch) reply(!result.isEmpty(), result.isEmpty() ? textResult({{"error", "The artwork preview could not be rendered."}}) : result);
            });
            watcher->setFuture(QtConcurrent::run([pixels, mask, rect, edge, prepared, canvasSize, root = m_artifactRoot + "/inputs"] {
                auto result = preview(pixels, mask, rect, edge, root, prepared);
                if (!result.isEmpty()) {
                    auto metadata = QJsonDocument::fromJson(result.first().toObject()["text"].toString().toUtf8()).object();
                    metadata["canvasWidth"] = canvasSize.width();
                    metadata["canvasHeight"] = canvasSize.height();
                    result[0] = textResult(metadata).first();
                }
                return result;
            }));
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

void AfterimageDocumentBridge::place(KisDocument *document, const QJsonObject &candidate, bool alignToSource, bool nearest, Reply reply)
{
    if (!document || !document->image()) { reply(false, textResult({{"error", "Open an artwork first."}})); return; }
    const QPointer<KisDocument> owner(document);
    KisImageSP image = document->image();
    const auto source = candidate["source"].toObject();
    const auto prepared = source["preparedSource"].toObject();
    const auto coordinates = prepared["sourceRect"].toArray();
    const QRect rect = coordinates.size() == 4 ? QRect(coordinates[0].toInt(), coordinates[1].toInt(), coordinates[2].toInt(), coordinates[3].toInt()) : QRect();
    if (alignToSource) {
        const bool sameDocument = source["documentId"].toString() == document->property("afterimageId").toString()
            || (!document->localFilePath().isEmpty() && QFileInfo(source["filePath"].toString()).canonicalFilePath() == QFileInfo(document->localFilePath()).canonicalFilePath());
        if (!sameDocument || rect.isEmpty() || image->width() != prepared["canvasWidth"].toInt(source["width"].toInt()) || image->height() != prepared["canvasHeight"].toInt(source["height"].toInt())) {
            reply(false, textResult({{"error", "Open the original artwork at its original canvas size to place this edit at its captured location. You can also turn off original-position placement to use it as a new image layer."}})); return;
        }
    }
    struct PreparedLayer { KisPaintDeviceSP pixels; KisPaintDeviceSP mask; QString error; };
    auto *watcher = new QFutureWatcher<PreparedLayer>(this);
    connect(watcher, &QFutureWatcher<PreparedLayer>::finished, this, [this, watcher, owner, image, reply, candidate]() mutable {
        const auto result = watcher->result(); watcher->deleteLater();
        if (!result.error.isEmpty()) { reply(false, textResult({{"error", result.error}})); return; }
        if (!owner || owner->image().data() != image.data()) { reply(false, textResult({{"error", "The target artwork was closed or replaced."}})); return; }
        auto *ready = new QTimer(this);
        ready->setInterval(30);
        connect(ready, &QTimer::timeout, this, [this, ready, owner, image, result, reply, candidate]() mutable {
            if (!owner || owner->image().data() != image.data()) {
                ready->stop(); ready->deleteLater(); reply(false, textResult({{"error", "The target artwork was closed or replaced."}})); return;
            }
            if (!image->tryBarrierLock(true)) return;
            ready->stop(); ready->deleteLater();
            KisPaintLayerSP layer = new KisPaintLayer(image, tr("AI edit · %1").arg(candidate["id"].toString().left(8)), 255, result.pixels);
            KisTransparencyMaskSP mask;
            if (result.mask) {
                mask = new KisTransparencyMask(image, tr("Original selection"));
                mask->initSelection(result.mask, layer);
                KisNodeFacade(layer).addNode(mask);
            }
            KisNodeSP above = image->rootLayer()->lastChild();
            image->unlock();
            // Attach the complete subtree in one command, so undo never queues a mask
            // update against a parent that another command is about to remove.
            KisProcessingApplicator operation(image, KisNodeSP(), KisProcessingApplicator::NONE, {}, kundo2_i18n("Place Afterimage candidate"));
            operation.applyCommand(new KisImageLayerAddCommand(image, layer, image->rootLayer(), above,
                KisImageLayerAddCommand::DoRedoUpdates | KisImageLayerAddCommand::DoUndoUpdates | KisImageLayerAddCommand::DontActivateOnAddition),
                KisStrokeJobData::BARRIER, KisStrokeJobData::EXCLUSIVE);
            auto completion = std::make_shared<std::future<bool>>(operation.successfullyCompletedFuture());
            operation.end();
            auto *finished = new QTimer(this);
            finished->setInterval(30);
            connect(finished, &QTimer::timeout, this, [finished, completion, owner, layer, reply] {
                if (completion->wait_for(std::chrono::seconds(0)) != std::future_status::ready) return;
                const bool success = completion->get(); finished->stop(); finished->deleteLater();
                reply(success && owner, textResult(success && owner ? QJsonObject{{"status", "completed"}, {"layerId", layer->uuid().toString(QUuid::WithoutBraces)}}
                    : QJsonObject{{"error", "The placement was cancelled."}}));
            });
            finished->start();
        });
        ready->start();
    });
    watcher->setFuture(QtConcurrent::run([candidate, prepared, alignToSource, nearest, rect, image] {
        PreparedLayer result;
        const QImage raster(candidate["path"].toString());
        if (raster.isNull()) { result.error = "The retained image could not be opened."; return result; }
        result.pixels = new KisPaintDevice(image->colorSpace());
        result.pixels->convertFromQImage(raster, nullptr);
        if (alignToSource) {
            KisBoxFilterStrategy pixels;
            KisBilinearFilterStrategy smooth;
            KisTransformWorker transform(result.pixels, double(rect.width()) / raster.width(), double(rect.height()) / raster.height(),
                0, 0, 0, rect.x(), rect.y(), nullptr, nearest ? static_cast<KisFilterStrategy *>(&pixels) : &smooth);
            if (!transform.run()) { result.error = "The candidate could not be aligned to its source."; return result; }
            result.pixels->crop(rect);
            const QString maskPath = prepared["maskPath"].toString();
            if (!maskPath.isEmpty()) {
                QFile file(maskPath);
                result.mask = new KisPaintDevice(KoColorSpaceRegistry::instance()->alpha8());
                KoColor defaultPixel(result.mask->colorSpace());
                defaultPixel.data()[0] = quint8(prepared["maskDefault"].toInt());
                result.mask->setDefaultPixel(defaultPixel);
                if (!file.open(QIODevice::ReadOnly) || !result.mask->read(&file)) { result.error = "The captured selection mask could not be opened."; return result; }
                result.mask->setX(prepared["maskX"].toInt()); result.mask->setY(prepared["maskY"].toInt());
            }
        }
        return result;
    }));
}
