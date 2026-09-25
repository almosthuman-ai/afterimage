// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#include "AfterimageCompositorImport.h"
#include <QBuffer>
#include <QFont>
#include <QFontMetricsF>
#include <QFutureWatcher>
#include <QImage>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QtConcurrentRun>
#include <KoStore.h>
#include <KoColorSpaceRegistry.h>
#include <KoShapeControllerBase.h>
#include <KisDocument.h>
#include <KisPart.h>
#include <kis_annotation.h>
#include <kis_group_layer.h>
#include <kis_image.h>
#include <kis_paint_device.h>
#include <kis_paint_layer.h>
#include <kis_transparency_mask.h>
#include <flake/kis_shape_layer.h>
#include <memory>

namespace {
struct Layer { QJsonObject metadata; KisPaintDeviceSP pixels, mask; };
struct Decoded { QJsonObject manifest; QVector<Layer> layers; QString error; };
Decoded decode(const QString &path, const KoColorSpace *colorSpace)
{
    Decoded result;
    std::unique_ptr<KoStore> archive(KoStore::createStore(path, KoStore::Read, {}, KoStore::Zip));
    if (!archive || archive->bad() || !archive->open("manifest.json")) {
        result.error = "This is not a readable Compositor document."; return result;
    }
    result.manifest = QJsonDocument::fromJson(archive->device()->readAll()).object();
    archive->close();
    if (result.manifest["format"] != "com.compositor.windows" || result.manifest["version"].toInt() != 1
        || result.manifest["width"].toInt() <= 0 || result.manifest["height"].toInt() <= 0) {
        result.error = "This Compositor document format is not supported."; return result;
    }
    const auto readImage = [&archive](const QString &entry) {
        if (!archive->open(entry)) return QImage();
        const QImage image = QImage::fromData(archive->device()->readAll()); archive->close(); return image;
    };
    for (const auto &value : result.manifest["layers"].toArray()) {
        const auto item = value.toObject();
        const QString kind = item["kind"].toString();
        if ((kind != "raster" && kind != "text" && kind != "group") || item["blend"].toString("normal") != "normal"
            || item["clipping"].toBool() || !item["effects"].toObject().isEmpty()
            || item["sx"].toDouble(1) != 1 || item["sy"].toDouble(1) != 1 || item["angle"].toDouble() != 0) {
            result.error = QString("Layer '%1' uses editing features that this importer cannot yet preserve. The original document has not been changed.").arg(item["name"].toString()); return result;
        }
        Layer layer; layer.metadata = item;
        if (kind == "raster") {
            const QImage pixels = readImage(item["image"].toString());
            if (pixels.isNull()) { result.error = "A layer image could not be read."; return result; }
            layer.pixels = new KisPaintDevice(colorSpace);
            layer.pixels->convertFromQImage(pixels, nullptr, qRound(item["x"].toDouble()), qRound(item["y"].toDouble()));
        }
        if (!item["mask"].toString().isEmpty()) {
            const QImage mask = readImage(item["mask"].toString()).convertToFormat(QImage::Format_Grayscale8);
            if (mask.isNull()) { result.error = "A layer mask could not be read."; return result; }
            layer.mask = new KisPaintDevice(KoColorSpaceRegistry::instance()->alpha8());
            for (int y = 0; y < mask.height(); ++y) layer.mask->writeBytes(mask.constScanLine(y), 0, y, mask.width(), 1);
            if (kind != "group") {
                layer.mask->setX(qRound(item["x"].toDouble()));
                layer.mask->setY(qRound(item["y"].toDouble()));
            }
        }
        result.layers.append(layer);
    }
    return result;
}
QByteArray textSvg(const QJsonObject &layer, int width, int height)
{
    const auto params = layer["params"].toObject();
    const QString family = params["fontFamily"].toString("Arial");
    const QString style = params["fontStyle"].toString("Regular");
    const int size = params["size"].toInt(48);
    QFont font(family); font.setPixelSize(size);
    font.setBold(style.contains("Bold", Qt::CaseInsensitive));
    font.setItalic(style.contains("Italic", Qt::CaseInsensitive) || style.contains("Oblique", Qt::CaseInsensitive));
    const QFontMetricsF metrics(font);
    const QStringList lines = params["text"].toString().split('\n');
    qreal maxWidth = 0;
    qreal top = 0;
    for (const auto &line : lines) { maxWidth = qMax(maxWidth, metrics.horizontalAdvance(line)); top = qMin(top, metrics.tightBoundingRect(line).top()); }
    const qreal x = layer["x"].toDouble() + 2;
    const qreal y = layer["y"].toDouble() + 2 - top;
    const qreal step = metrics.ascent() + params["spacing"].toDouble(4);
    QString svg = QString("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"%1\" height=\"%2\" viewBox=\"0 0 %1 %2\"><text font-family=\"%3\" font-size=\"%4\" font-weight=\"%5\" font-style=\"%6\" fill=\"%7\">")
        .arg(width).arg(height).arg(family.toHtmlEscaped()).arg(size).arg(font.bold() ? "bold" : "normal").arg(font.italic() ? "italic" : "normal").arg(params["color"].toString("#ffffff").toHtmlEscaped());
    for (int i = 0; i < lines.size(); ++i) {
        const qreal difference = maxWidth - metrics.horizontalAdvance(lines[i]);
        const QString align = params["align"].toString();
        const qreal offset = align == "center" ? difference / 2 : align == "right" ? difference : 0;
        svg += QString("<tspan x=\"%1\" y=\"%2\">%3</tspan>").arg(x + offset).arg(y + i * step).arg(lines[i].toHtmlEscaped());
    }
    return (svg + "</text></svg>").toUtf8();
}
}

void AfterimageCompositorImport::load(const QString &path, Reply reply)
{
    const auto *colorSpace = KoColorSpaceRegistry::instance()->rgb8();
    auto *watcher = new QFutureWatcher<Decoded>(this);
    connect(watcher, &QFutureWatcher<Decoded>::finished, this, [watcher, reply, colorSpace, path] {
        const auto decoded = watcher->result(); watcher->deleteLater();
        if (!decoded.error.isEmpty()) { reply(nullptr, decoded.error); return; }
        const auto manifest = decoded.manifest;
        std::unique_ptr<KisDocument> document(KisPart::instance()->createDocument());
        KisImageSP image = new KisImage(document->createUndoStore(), manifest["width"].toInt(), manifest["height"].toInt(), colorSpace, manifest["title"].toString());
        image->setResolution(1, 1);
        document->setCurrentImage(image);
        QHash<QString, KisNodeSP> nodes;
        for (const auto &source : decoded.layers) {
            const auto item = source.metadata;
            const QString name = item["name"].toString();
            const quint8 opacity = quint8(qBound(0, qRound(item["opacity"].toDouble(1) * 255), 255));
            KisLayerSP layer;
            if (item["kind"] == "group") layer = new KisGroupLayer(image, name, opacity);
            else if (item["kind"] == "raster") layer = new KisPaintLayer(image, name, opacity, source.pixels);
            else {
                QByteArray svg = textSvg(item, image->width(), image->height()); QBuffer input(&svg); input.open(QIODevice::ReadOnly);
                QStringList warnings, errors;
                const auto shapes = KisShapeLayer::createShapesFromSvg(&input, {}, image->bounds(), 72,
                    document->shapeController()->resourceManager(), false, nullptr, &warnings, &errors);
                if (shapes.isEmpty() || !errors.isEmpty()) { qDeleteAll(shapes); reply(nullptr, QString("Text layer '%1' could not be imported as editable text: %2").arg(name, errors.join('\n'))); return; }
                auto *vector = new KisShapeLayer(document->shapeController(), image, name, opacity);
                for (auto *shape : shapes) vector->addShape(shape);
                layer = vector;
            }
            layer->setVisible(item["visible"].toBool(true));
            layer->setUserLocked(item["locked"].toBool());
            nodes.insert(item["id"].toString(), layer);
        }
        for (const auto &source : decoded.layers) {
            const auto item = source.metadata;
            KisNodeSP node = nodes.value(item["id"].toString());
            const QString parentId = item["parent"].toString();
            KisNodeSP parent = parentId.isEmpty() ? KisNodeSP(image->rootLayer()) : nodes.value(parentId);
            if (!parent || (parent != image->rootLayer().data() && !dynamic_cast<KisGroupLayer *>(parent.data()))) {
                reply(nullptr, "A layer group could not be recovered."); return;
            }
            if (!image->addNode(node, parent)) { reply(nullptr, "A layer could not be added to its original group."); return; }
            if (source.mask) {
                KisTransparencyMaskSP mask = new KisTransparencyMask(image, tr("Compositor mask"));
                mask->initSelection(source.mask, dynamic_cast<KisLayer *>(node.data()));
                mask->setVisible(item["mask_enabled"].toBool(true));
                image->addNode(mask, node);
            }
        }
        image->addAnnotation(new KisAnnotation("afterimage-compositor-source", "Original Compositor layer metadata and provenance", QJsonDocument(manifest).toJson()));
        document->setCurrentImage(image, true, nodes.value(manifest["active"].toString()));
        document->setProperty("afterimageId", manifest["id"].toString());
        document->setObjectName(manifest["title"].toString());
        document->setModified(true);
        image->refreshGraphAsync();
        reply(document.release(), tr("Imported editable layers from %1. Text remains editable; review its spacing before publishing.").arg(path));
    });
    watcher->setFuture(QtConcurrent::run(decode, path, colorSpace));
}
