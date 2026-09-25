// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#include "TempleToolGateway.h"
#include "TempleRecipe.h"
#include "TempleService.h"
#include <KisDocument.h>
#include <QJsonDocument>
#include <QMetaObject>
#include <QPointer>
#include <memory>

namespace {
QJsonObject spec(const QString &name, const QString &description, const QJsonObject &properties,
                 const QJsonArray &required = {}) {
    return {{"type", "function"}, {"name", name}, {"description", description}, {"inputSchema", QJsonObject{
        {"type", "object"}, {"properties", properties}, {"required", required}, {"additionalProperties", false}}}};
}
QJsonObject stringSpec(const QString &description = {}) {
    QJsonObject property{{"type", "string"}};
    if (!description.isEmpty()) property["description"] = description;
    return property;
}
QJsonObject error(const QString &message) { return {{"error", message}}; }
}

QJsonArray TempleToolGateway::tools() {
    const auto document = stringSpec(QStringLiteral("Document ID returned by afterimage_document; must equal the conversation's bound artwork."));
    return {
        spec("afterimage_temple_catalog", "Inspect bounded pages of the source-derived Glitch Temple effect, FORM-control, or palette catalog. Use effectType for one complete process definition.",
            {{"family", QJsonObject{{"type", "string"}, {"enum", QJsonArray{"effects", "form", "palettes"}}}},
             {"offset", QJsonObject{{"type", "integer"}, {"minimum", 0}}},
             {"limit", QJsonObject{{"type", "integer"}, {"minimum", 1}, {"maximum", 40}}},
             {"effectType", stringSpec()}}, QJsonArray{"family"}),
        spec("afterimage_temple_recipe", "Get the complete starter recipe or the editable recipe attached to a native Temple layer in the bound artwork.",
            {{"documentId", document}, {"layerId", stringSpec(QStringLiteral("Native layer UUID; omit for a fresh starter recipe."))}},
            QJsonArray{"documentId"}),
        spec("afterimage_temple_render", "Render a full Glitch Temple recipe against the exact bound native artwork. maxEdge 0 renders full size for later apply; 64–4096 produces a bounded preview. Returns an app-owned PNG path after the real private engine finishes; inspect the PNG with an image-viewing tool.",
            {{"documentId", document}, {"recipe", QJsonObject{{"type", "object"}}},
             {"maxEdge", QJsonObject{{"type", "integer"}, {"minimum", 0}, {"maximum", 4096}}}},
            QJsonArray{"documentId", "recipe"}),
        spec("afterimage_temple_export_loop", "Render a complete source-authored Temple animation from the exact bound artwork and encode GIF or MP4 through the app-owned FFmpeg. Completion returns an output file path and timing metadata; this does not change native layers or the foreground desktop.",
            {{"documentId", document}, {"recipe", QJsonObject{{"type", "object"}}},
             {"format", QJsonObject{{"type", "string"}, {"enum", QJsonArray{"gif", "mp4"}}}},
             {"outputPath", stringSpec(QStringLiteral("Optional destination ending in .gif or .mp4; omit for an app-owned artifact path."))}},
            QJsonArray{"documentId", "recipe", "format"}),
        spec("afterimage_temple_apply", "Add one already completed full-size Temple render to its exact bound native artwork as an undoable layer. The artist's active tab, layer, tool, keyboard, and mouse focus remain untouched.",
            {{"documentId", document}, {"renderId", stringSpec()}},
            QJsonArray{"documentId", "renderId"})
    };
}

void TempleToolGateway::invoke(KisDocument *boundDocument, const QString &tool,
                               const QJsonObject &arguments, Reply reply) {
    auto *service = TempleService::instance();
    if (tool == "afterimage_temple_catalog") {
        const QString family = arguments["family"].toString();
        const QString key = family == "effects" ? "effects" : family == "form" ? "formParameters" : family == "palettes" ? "palettes" : QString();
        if (key.isEmpty()) { reply(false, error("Choose effects, form, or palettes.")); return; }
        const QJsonArray entries = TempleRecipe::catalog()[key].toArray();
        const QString effectType = arguments["effectType"].toString();
        if (!effectType.isEmpty()) {
            if (family != "effects") { reply(false, error("effectType only applies to effects.")); return; }
            for (const auto &entry : entries) if (entry.toObject()["type"] == effectType) {
                reply(true, {{"sourceVersion", TempleRecipe::catalog()["sourceVersion"]}, {"effect", entry}}); return;
            }
            reply(false, error("That Temple effect is not in the source catalog.")); return;
        }
        const int offset = qMax(0, arguments["offset"].toInt());
        const int limit = qBound(1, arguments["limit"].toInt(20), 40);
        QJsonArray page;
        for (int i = offset; i < qMin(entries.size(), offset + limit); ++i) {
            const auto value = entries[i];
            if (family == "effects") {
                const auto item = value.toObject();
                page.append(QJsonObject{{"type", item["type"]}, {"name", item["name"]}, {"category", item["category"]},
                    {"description", item["description"]}});
            } else page.append(value);
        }
        QJsonObject result{{"sourceVersion", TempleRecipe::catalog()["sourceVersion"]}, {"family", family},
            {"offset", offset}, {"total", entries.size()}, {"items", page}};
        if (offset + page.size() < entries.size()) result["nextOffset"] = offset + page.size();
        reply(true, result);
        return;
    }
    if (!boundDocument || !boundDocument->image()) { reply(false, error("This conversation has no open native artwork.")); return; }
    const QString documentId = service->documentId(boundDocument);
    if (arguments["documentId"].toString() != documentId) {
        reply(false, error("The document ID does not match this conversation's bound artwork.")); return;
    }
    if (tool == "afterimage_temple_recipe") {
        const QString layerId = arguments["layerId"].toString();
        const QJsonObject stored = layerId.isEmpty() ? TempleRecipe::initial() : service->recipeForLayer(documentId, layerId);
        if (stored.isEmpty()) { reply(false, error("No editable Temple recipe is attached to that layer.")); return; }
        QString retainError;
        const QJsonObject recipe = TempleRecipe::retainMaterials(stored, &retainError);
        if (!retainError.isEmpty()) { reply(false, error(retainError)); return; }
        reply(true, {{"documentId", documentId}, {"layerId", layerId},
            {"source", layerId.isEmpty() ? "starter" : "native-layer-annotation"}, {"recipe", recipe}});
        return;
    }
    if (tool == "afterimage_temple_render") {
        if (!arguments["recipe"].isObject()) { reply(false, error("Supply a complete Temple recipe object.")); return; }
        const int maxEdge = arguments["maxEdge"].toInt(1024);
        if (maxEdge != 0 && (maxEdge < 64 || maxEdge > 4096)) { reply(false, error("maxEdge must be 0 or 64–4096.")); return; }
        auto connection = std::make_shared<QMetaObject::Connection>();
        auto expected = std::make_shared<QString>();
        QPointer<TempleToolGateway> owner(this);
        *connection = connect(service, &TempleService::renderFinished, this,
            [connection, expected, reply, owner, documentId](const QString &id, const QJsonObject &result) {
                if (!owner || id != *expected) return;
                QObject::disconnect(*connection);
                QJsonObject response = result;
                response["documentId"] = documentId;
                reply(!result.contains("error"), response);
            });
        *expected = service->renderRecipe(documentId, arguments["recipe"].toObject(), maxEdge);
        return;
    }
    if (tool == "afterimage_temple_export_loop") {
        if (!arguments["recipe"].isObject()) { reply(false, error("Supply a complete Temple recipe object.")); return; }
        const QString format = arguments["format"].toString();
        auto connection = std::make_shared<QMetaObject::Connection>();
        auto expected = std::make_shared<QString>();
        QPointer<TempleToolGateway> owner(this);
        *connection = connect(service, &TempleService::loopFinished, this,
            [connection, expected, reply, owner, documentId](const QString &id, const QJsonObject &result) {
                if (!owner || id != *expected) return;
                QObject::disconnect(*connection);
                QJsonObject response = result;
                response["documentId"] = documentId;
                reply(!result.contains("error"), response);
            });
        *expected = service->exportLoop(documentId, arguments["recipe"].toObject(), format,
                                        arguments["outputPath"].toString());
        return;
    }
    if (tool == "afterimage_temple_apply") {
        const QString renderId = arguments["renderId"].toString();
        const QJsonObject info = service->renderInfo(renderId);
        if (renderId.isEmpty() || info["documentId"].toString() != documentId) {
            reply(false, error("The completed render does not belong to this bound artwork.")); return;
        }
        auto connection = std::make_shared<QMetaObject::Connection>();
        QPointer<TempleToolGateway> owner(this);
        *connection = connect(service, &TempleService::applyFinished, this,
            [connection, renderId, reply, owner](const QString &id, const QJsonObject &result) {
                if (!owner || id != renderId) return;
                QObject::disconnect(*connection);
                reply(!result.contains("error"), result);
            });
        service->applyRender(renderId);
        return;
    }
    reply(false, error("Unknown Temple tool."));
}
