// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#include "ArtistToolGateway.h"
#include "ArtistNative.h"
#include "ComicProject.h"
#include <KisDocument.h>
#include <kis_image.h>
#include <kis_selection.h>
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
        spec("afterimage_artist_lettering", "Add a wrapped, editable vector caption or balloon to the bound page. Give a region, or useSelection to use the page's native selection; x/y remains available for simple placement.",
            {{"documentId", document}, {"kind", QJsonObject{{"type", "string"}, {"enum", QJsonArray{"caption", "balloon"}}}},
             {"text", fieldSpec("string")}, {"font", fieldSpec("string")}, {"size", fieldSpec("integer")},
             {"x", fieldSpec("integer")}, {"y", fieldSpec("integer")}, {"useSelection", fieldSpec("boolean")},
             {"region", QJsonObject{{"type", "object"}, {"properties", QJsonObject{
                {"x", fieldSpec("integer")}, {"y", fieldSpec("integer")},
                {"width", fieldSpec("integer")}, {"height", fieldSpec("integer")}}},
                {"required", QJsonArray{"x", "y", "width", "height"}}, {"additionalProperties", false}}}},
            {"documentId", "kind", "text"}),
        spec("afterimage_artist_export", "Export the bound artwork to a PNG or 300 dpi comic PDF. PNG can use nearest-neighbor integer scale and indexed color if no more than 256 color-and-alpha values exist.",
            {{"documentId", document}, {"path", fieldSpec("string")}, {"format", QJsonObject{{"type", "string"}, {"enum", QJsonArray{"png", "pdf"}}}},
             {"scale", QJsonObject{{"type", "integer"}, {"minimum", 1}, {"maximum", 16}}}, {"indexed", fieldSpec("boolean")}},
            {"documentId", "path", "format"}),
        spec("afterimage_artist_comic_pages", "List saved editable KRA pages in a local comic folder in their persistent reading order. New KRA files are appended.",
            {{"documentId", document}, {"folder", fieldSpec("string")}}, {"documentId", "folder"}),
        spec("afterimage_artist_save_comic_page", "Save the exact bound artwork as an editable KRA page in a comic folder, then add it to the reading order after the native save completes.",
            {{"documentId", document}, {"folder", fieldSpec("string")}, {"filename", fieldSpec("string", "Local KRA filename")}},
            {"documentId", "folder", "filename"}),
        spec("afterimage_artist_comic_reorder", "Save the reading order of every KRA page in a comic folder; the KRA files remain the artwork source of truth.",
            {{"documentId", document}, {"folder", fieldSpec("string")},
             {"pages", QJsonObject{{"type", "array"}, {"items", fieldSpec("string", "KRA filename in this folder")}}}},
            {"documentId", "folder", "pages"}),
        spec("afterimage_artist_export_comic_pdf", "Export all saved KRA pages in the comic folder's reading order to a multi-page PDF, preserving each page's own size and resolution with zero margins. Reads one page at a time without changing the artist's active tab.",
            {{"documentId", document}, {"folder", fieldSpec("string")}, {"path", fieldSpec("string")}},
            {"documentId", "folder", "path"})
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
        const int size = arguments["size"].toInt(52);
        QRect region;
        if (arguments["region"].isObject()) {
            const QJsonObject value = arguments["region"].toObject();
            region = QRect(value["x"].toInt(), value["y"].toInt(), value["width"].toInt(), value["height"].toInt());
        } else if (arguments["useSelection"].toBool(false)) {
            if (const auto selection = image->globalSelection()) region = selection->selectedExactRect();
        } else if (arguments.contains("x") && arguments.contains("y")) {
            const int x = arguments["x"].toInt(-1), y = arguments["y"].toInt(-1);
            if (x >= 0 && y >= 0 && x < image->width() && y < image->height()) {
                const QByteArray svg = ArtistNative::letteringSvg(image->width(), image->height(), content,
                    arguments["font"].toString("Segoe UI"), size, x, y, balloon);
                if (svg.isEmpty()) { native->deleteLater(); reply(false, error("The words do not fit at that position.")); return; }
                native->addVector(boundDocument, svg, balloon ? QStringLiteral("Balloon") : QStringLiteral("Caption"), {}, finish);
                return;
            }
        } else region = QRect(image->width() / 10, image->height() / 10,
            qMax(80, image->width() * 2 / 5), qMax(50, image->height() / 7));
        if (size <= 0 || region.isEmpty()) { native->deleteLater(); reply(false, error("Choose text size and an area inside the page.")); return; }
        const QByteArray svg = ArtistNative::letteringSvg(image->width(), image->height(), content,
            arguments["font"].toString("Segoe UI"), size, region, balloon);
        if (svg.isEmpty()) { native->deleteLater(); reply(false, error("Write text and choose a position inside the page.")); return; }
        native->addVector(boundDocument, svg, balloon ? QStringLiteral("Balloon") : QStringLiteral("Caption"), {}, finish);
        return;
    }
    if (tool == "afterimage_artist_comic_pages" || tool == "afterimage_artist_save_comic_page" ||
        tool == "afterimage_artist_comic_reorder" ||
        tool == "afterimage_artist_export_comic_pdf") {
        const QString folder = arguments["folder"].toString();
        if (folder.isEmpty() || !QDir(folder).exists()) {
            native->deleteLater(); reply(false, error("Choose an existing comic folder.")); return;
        }
        if (tool == "afterimage_artist_comic_pages") {
            const QStringList pages = ComicProject::pages(folder);
            QJsonArray entries;
            for (const QString &name : pages) entries.append(name);
            native->deleteLater(); reply(true, {{"documentId", id}, {"folder", QDir(folder).absolutePath()}, {"pages", entries}});
            return;
        }
        if (tool == "afterimage_artist_save_comic_page") {
            const QString filename = arguments["filename"].toString();
            if (QFileInfo(filename).fileName() != filename || !filename.endsWith(QLatin1String(".kra"), Qt::CaseInsensitive)) {
                native->deleteLater(); reply(false, error("Choose a local KRA page filename.")); return;
            }
            const QString path = QDir(folder).absoluteFilePath(filename);
            native->saveComicPage(boundDocument, path, folder,
                [native, owner, id, reply, path](bool okay, const QString &message) {
                    native->deleteLater();
                    if (!owner) { reply(false, error("The artwork was closed.")); return; }
                    reply(okay, okay ? QJsonObject{{"documentId", id}, {"path", path}, {"message", message}} : error(message));
                });
            return;
        }
        if (tool == "afterimage_artist_comic_reorder") {
            QStringList names;
            for (const QJsonValue &value : arguments["pages"].toArray()) names.append(value.toString());
            QString message;
            const bool okay = ComicProject::saveOrder(folder, names, &message);
            native->deleteLater();
            if (!okay) { reply(false, error(message)); return; }
            QJsonArray entries; for (const QString &name : names) entries.append(name);
            reply(true, {{"documentId", id}, {"folder", QDir(folder).absolutePath()}, {"pages", entries}});
            return;
        }
        const QString path = arguments["path"].toString();
        if (path.isEmpty() || QFileInfo(path).suffix().compare("pdf", Qt::CaseInsensitive) != 0 ||
            !QDir(QFileInfo(path).absolutePath()).exists()) {
            native->deleteLater(); reply(false, error("Choose a PDF path in an existing folder.")); return;
        }
        QStringList paths;
        for (const QString &name : ComicProject::pages(folder)) paths.append(QDir(folder).filePath(name));
        native->exportComicPdf(paths, path, [native, owner, id, reply, path](bool okay, const QString &message) {
            native->deleteLater();
            if (!owner) { reply(false, error("The artwork was closed.")); return; }
            reply(okay, okay ? QJsonObject{{"documentId", id}, {"outputPath", path}} : error(message));
        });
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
