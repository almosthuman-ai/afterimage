// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#include "ArtistToolGateway.h"
#include "ArtistNative.h"
#include <KisDocument.h>
#include <kis_image.h>
#include <QDir>
#include <QFileInfo>
#include <QPointer>
#include <QStringList>

namespace {
QJsonObject fieldSpec(const QString &type, const QString &description = {}) {
    QJsonObject item{{"type", type}};
    if (!description.isEmpty()) item["description"] = description;
    return item;
}
QJsonObject spec(const QString &name, const QString &description, const QJsonObject &properties,
                 const QJsonArray &required) {
    return {{"type", "function"}, {"name", name}, {"description", description},
        {"inputSchema", QJsonObject{{"type", "object"}, {"properties", properties},
            {"required", required}, {"additionalProperties", false}}}};
}
QJsonObject error(const QString &message) { return {{"error", message}}; }
}

QJsonArray ArtistToolGateway::tools()
{
    const auto document = fieldSpec("string", QStringLiteral("ID of this conversation's bound native artwork, from afterimage_document."));
    return {
        spec("afterimage_artist_palette_layer", "Create an editable palette-limited paint layer from the bound artwork's current projection. Alpha stays intact; original layers remain hidden and undoable.",
            {{"documentId", document}, {"colors", QJsonObject{{"type", "array"}, {"minItems", 1}, {"maxItems", 256}, {"items", fieldSpec("string", "Hex RGB palette color")}}},
             {"dither", fieldSpec("boolean")}}, {"documentId", "colors"}),
        spec("afterimage_artist_panels", "Add or revise editable vector panel frames in the exact bound page without selecting a tab or layer.",
            {{"documentId", document}, {"layout", QJsonObject{{"type", "string"}, {"enum", QJsonArray{"1x1", "1x2", "3x1", "2x2", "2x3", "splash"}}}},
             {"margin", fieldSpec("integer")}, {"gutter", fieldSpec("integer")}}, {"documentId", "layout"}),
        spec("afterimage_artist_lettering", "Add a native editable vector caption or balloon layer to the exact bound page.",
            {{"documentId", document}, {"kind", QJsonObject{{"type", "string"}, {"enum", QJsonArray{"caption", "balloon"}}}},
             {"text", fieldSpec("string")}, {"font", fieldSpec("string")}, {"size", fieldSpec("integer")},
             {"x", fieldSpec("integer")}, {"y", fieldSpec("integer")}},
            {"documentId", "kind", "text", "x", "y"}),
        spec("afterimage_artist_export", "Export the bound artwork to a PNG or 300 dpi comic PDF. PNG can use nearest-neighbor integer scale and indexed color if no more than 256 color-and-alpha values exist.",
            {{"documentId", document}, {"path", fieldSpec("string")}, {"format", QJsonObject{{"type", "string"}, {"enum", QJsonArray{"png", "pdf"}}}},
             {"scale", QJsonObject{{"type", "integer"}, {"minimum", 1}, {"maximum", 16}}}, {"indexed", fieldSpec("boolean")}},
            {"documentId", "path", "format"})
    };
}

void ArtistToolGateway::invoke(KisDocument *boundDocument, const QString &tool, const QJsonObject &arguments, Reply reply)
{
    if (!boundDocument || !boundDocument->image()) { reply(false, error("This conversation has no bound artwork.")); return; }
    const QString id = boundDocument->property("afterimageId").toString();
    if (id.isEmpty() || arguments["documentId"].toString() != id) {
        reply(false, error("The document ID does not match this conversation's bound artwork.")); return;
    }
    QPointer<KisDocument> owner(boundDocument);
    auto *native = new ArtistNative(this);
    const auto finish = [native, owner, id, reply](bool okay, const QString &message) {
        native->deleteLater();
        if (!owner) { reply(false, error("The artwork was closed.")); return; }
        reply(okay, okay ? QJsonObject{{"documentId", id}, {"message", message}} : error(message));
    };
    KisImageSP image = boundDocument->image();
    if (tool == "afterimage_artist_palette_layer") {
        const QJsonArray input = arguments["colors"].toArray();
        if (input.isEmpty() || input.size() > 256) { native->deleteLater(); reply(false, error("Choose 1–256 palette colors.")); return; }
        QVector<QColor> colors;
        for (const auto &value : input) {
            const QColor color(value.toString());
            if (!color.isValid()) { native->deleteLater(); reply(false, error("A palette color is invalid.")); return; }
            colors.append(color);
        }
        native->paletteLayer(boundDocument, colors, arguments["dither"].toBool(false), finish);
        return;
    }
    if (tool == "afterimage_artist_panels") {
        const QString layout = arguments["layout"].toString();
        if (!QStringList{"1x1", "1x2", "3x1", "2x2", "2x3", "splash"}.contains(layout)) {
            native->deleteLater(); reply(false, error("Choose a supported panel layout.")); return;
        }
        const int margin = arguments["margin"].toInt(90), gutter = arguments["gutter"].toInt(36);
        if (margin < 0 || gutter < 0) { native->deleteLater(); reply(false, error("Margins and gutters must be nonnegative.")); return; }
        const QByteArray svg = ArtistNative::panelSvg(image->width(), image->height(), layout, margin, gutter);
        if (svg.isEmpty()) { native->deleteLater(); reply(false, error("Margins and gutters leave no room for panels.")); return; }
        native->addVector(boundDocument, svg, QStringLiteral("Panels · %1").arg(layout), QStringLiteral("Panels · "), finish);
        return;
    }
    if (tool == "afterimage_artist_lettering") {
        const QString kind = arguments["kind"].toString();
        const bool balloon = kind == "balloon";
        if (!balloon && kind != "caption") { native->deleteLater(); reply(false, error("Choose caption or balloon.")); return; }
        const QString content = arguments["text"].toString();
        const int size = arguments["size"].toInt(52), x = arguments["x"].toInt(-1), y = arguments["y"].toInt(-1);
        if (size <= 0 || x < 0 || y < 0 || x >= image->width() || y >= image->height()) {
            native->deleteLater(); reply(false, error("Choose positive text size and a position inside the page.")); return;
        }
        const QByteArray svg = ArtistNative::letteringSvg(image->width(), image->height(), content,
            arguments["font"].toString("Segoe UI"), size, x, y, balloon);
        if (svg.isEmpty()) { native->deleteLater(); reply(false, error("Write text and choose a position inside the page.")); return; }
        native->addVector(boundDocument, svg, balloon ? QStringLiteral("Balloon") : QStringLiteral("Caption"), {}, finish);
        return;
    }
    if (tool == "afterimage_artist_export") {
        const QString format = arguments["format"].toString();
        const bool pdf = format == "pdf", indexed = arguments["indexed"].toBool(false);
        const int scale = arguments["scale"].toInt(1);
        const QString path = arguments["path"].toString();
        if ((!pdf && format != "png") || (pdf && (indexed || scale != 1)) || scale < 1 || scale > 16 ||
            path.isEmpty() || QFileInfo(path).suffix().compare(format, Qt::CaseInsensitive) != 0 ||
            !QDir(QFileInfo(path).absolutePath()).exists()) {
            native->deleteLater(); reply(false, error("Choose an existing output folder and a matching PNG or PDF path.")); return;
        }
        native->exportProjection(boundDocument, path, scale, pdf, indexed,
            [native, owner, id, reply, path](bool okay, const QString &message) {
                native->deleteLater();
                if (!owner) { reply(false, error("The artwork was closed.")); return; }
                reply(okay, okay ? QJsonObject{{"documentId", id}, {"outputPath", path}}
                    : error(message));
            });
        return;
    }
    native->deleteLater();
    reply(false, error("Unknown artist tool."));
}
