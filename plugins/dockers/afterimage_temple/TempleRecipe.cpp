// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#include "TempleRecipe.h"
#include <QBuffer>
#include <QCryptographicHash>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QImageReader>
#include <QSaveFile>
#include <QStandardPaths>
#include <QJsonDocument>
#include <QUuid>
#include <QDateTime>

namespace {
QJsonObject loadObject(const QString &path) {
    QFile file(path);
    if (!file.open(QIODevice::ReadOnly)) return {};
    return QJsonDocument::fromJson(file.readAll()).object();
}
QJsonObject defaultWhere() {
    return {{"mode", "whole"}, {"threshold", .5}, {"softness", .12}, {"hue", 0}, {"hueWidth", 36},
        {"scale", 48}, {"invert", false}, {"seed", 886}, {"sampleColor", 0xc83d58},
        {"sampleX", .5}, {"sampleY", .5}, {"colorReach", .16}, {"shadeLoyalty", .68},
        {"edgeLoyalty", .58}, {"bodyExpansion", 0}, {"recognition", .72}, {"targetMemory", "current"}};
}
QJsonObject definition(const QString &type) {
    for (const auto &value : TempleRecipe::catalog()["effects"].toArray()) {
        const auto object = value.toObject();
        if (object["type"].toString() == type) return object;
    }
    return {};
}
QString materialVault() {
    return QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation) + "/temple/materials";
}
QString retainBytes(const QByteArray &bytes, const QString &extension, QString *error) {
    if (bytes.isEmpty()) { if (error) *error = QStringLiteral("An embedded Temple image is empty."); return {}; }
    QBuffer buffer;
    buffer.setData(bytes);
    buffer.open(QIODevice::ReadOnly);
    QImageReader reader(&buffer);
    if (!reader.canRead()) { if (error) *error = QStringLiteral("An embedded Temple image is unreadable."); return {}; }
    const QString digest = QString::fromLatin1(QCryptographicHash::hash(bytes, QCryptographicHash::Sha256).toHex());
    const QString path = materialVault() + "/" + digest + "." + extension;
    if (QFileInfo::exists(path)) return path;
    if (!QDir().mkpath(materialVault())) { if (error) *error = QStringLiteral("Temple's material vault is unavailable."); return {}; }
    QSaveFile file(path);
    if (!file.open(QIODevice::WriteOnly) || file.write(bytes) != bytes.size() || !file.commit()) {
        if (error) *error = QStringLiteral("Could not retain an embedded Temple image."); return {};
    }
    return path;
}
QString retainPath(const QString &source, QString *error) {
    QFileInfo info(source);
    if (!info.isFile()) return source;
    const QString vault = QDir::cleanPath(materialVault()) + '/';
    if (QDir::cleanPath(info.absoluteFilePath()).startsWith(vault, Qt::CaseInsensitive)) return source;
    QFile input(source);
    if (!input.open(QIODevice::ReadOnly)) { if (error) *error = QStringLiteral("Could not read a Temple material."); return {}; }
    QCryptographicHash hash(QCryptographicHash::Sha256);
    if (!hash.addData(&input)) { if (error) *error = QStringLiteral("Could not fingerprint a Temple material."); return {}; }
    const QString extension = info.suffix().toLower().isEmpty() ? QStringLiteral("png") : info.suffix().toLower();
    const QString outputPath = materialVault() + "/" + QString::fromLatin1(hash.result().toHex()) + "." + extension;
    if (QFileInfo::exists(outputPath)) return outputPath;
    if (!QDir().mkpath(materialVault()) || !input.seek(0)) {
        if (error) *error = QStringLiteral("Temple's material vault is unavailable."); return {};
    }
    QSaveFile output(outputPath);
    if (!output.open(QIODevice::WriteOnly)) { if (error) *error = QStringLiteral("Could not retain a Temple material."); return {}; }
    while (!input.atEnd()) {
        const QByteArray block = input.read(1024 * 1024);
        if (block.isEmpty() || output.write(block) != block.size()) {
            output.cancelWriting(); if (error) *error = QStringLiteral("Could not retain a Temple material."); return {};
        }
    }
    if (!output.commit()) { if (error) *error = QStringLiteral("Could not commit a Temple material."); return {}; }
    return outputPath;
}
QJsonValue retainValue(const QJsonValue &value, const QString &field, QString *error) {
    if (error && !error->isEmpty()) return value;
    if (value.isObject()) {
        QJsonObject object = value.toObject();
        for (auto it = object.begin(); it != object.end(); ++it) it.value() = retainValue(it.value(), it.key(), error);
        return object;
    }
    if (value.isArray()) {
        QJsonArray array = value.toArray();
        for (int i = 0; i < array.size(); ++i) array.replace(i, retainValue(array[i], field, error));
        return array;
    }
    if (!value.isString()) return value;
    const QString source = value.toString();
    if (source.startsWith("data:image/", Qt::CaseInsensitive)) {
        const int comma = source.indexOf(",");
        const QString header = source.left(comma).toLower();
        if (comma < 0 || !header.endsWith(";base64")) {
            if (error) *error = QStringLiteral("A Temple image data URI has an unsupported encoding."); return value;
        }
        QString extension = header.mid(11, header.size() - 18);
        if (extension == "jpeg") extension = "jpg";
        if (extension != "png" && extension != "jpg" && extension != "webp" && extension != "gif") {
            if (error) *error = QStringLiteral("A Temple image data URI has an unsupported format."); return value;
        }
        const QString path = retainBytes(QByteArray::fromBase64(source.mid(comma + 1).toLatin1()), extension, error);
        return path.isEmpty() ? value : QJsonValue(path);
    }
    if (field == "filePath" || field == "sourceImage") return retainPath(source, error);
    return value;
}
}

QJsonObject TempleRecipe::catalog() {
    static const QJsonObject data = loadObject(":/afterimage/temple/resources/catalog.json");
    return data;
}
QJsonObject TempleRecipe::retainMaterials(const QJsonObject &recipe, QString *error) {
    if (error) error->clear();
    return retainValue(recipe, QString(), error).toObject();
}

QString TempleRecipe::labelFor(const QString &type) {
    const auto object = definition(type);
    return object["name"].toString(type);
}

QJsonObject TempleRecipe::createEffect(const QString &type) {
    const auto details = definition(type);
    if (details.isEmpty()) return {};
    QJsonObject parameters;
    for (const auto &value : details["parameters"].toArray()) {
        const auto parameter = value.toObject();
        parameters[parameter["id"].toString()] = parameter["default"];
    }
    QJsonObject effect{{"id", QStringLiteral("%1-%2").arg(type, QUuid::createUuid().toString(QUuid::WithoutBraces))},
        {"type", type}, {"enabled", true}, {"where", defaultWhere()}, {"parameters", parameters}};
    if (type == "dither-field") parameters["ditherVersion"] = 2;
    if (type == "wizprocess") effect["wizprocess"] = QJsonObject{{"kind", "wizprocess"}, {"mass", .82}, {"structure", .68},
        {"grain", .42}, {"compression", 36}, {"expansion", 42}, {"colorSpace", "hsb"}, {"channels", "separate"},
        {"channelPhase", 0}, {"path", "rows"}, {"reconstruction", "fold"}, {"tide", .46},
        {"newStructureScale", true}, {"newStructureWhere", true}, {"newColors", true}};
    if (type == "ultimate-sort") effect["ultimateSort"] = QJsonObject{{"kind", "ultimate-sort"}, {"recipes", QJsonArray{
        QJsonObject{{"id", "green-resolution-wake"}, {"enabled", true}, {"method", "permute"}, {"amount", .1},
            {"action", "sort"}, {"direction", "left"}, {"signal", "hue"}, {"territory", "green"},
            {"gate", 280}, {"toneTolerance", .2}, {"resolution", "wake"}, {"minBlock", 1}, {"maxBlock", 18},
            {"selectionSpeed", 3}, {"scatterRefresh", 12}}
    }}};
    if (type == "ascii-field" || type == "surface-motion") effect["characterField"] = QJsonObject{{"kind", "ascii"},
        {"asciiVersion", 2}, {"bank", "punctuation"}, {"glyphs", QJsonArray{" ", ".", ",", ":", ";", "!", "?", "'", "\"", "/", "\\", "|", "_", "~"}},
        {"composition", "inlay"}, {"glyphLogic", "hybrid"}, {"alphabetOrder", "measured"}, {"placement", "whole"},
        {"fontAsset", "source-code-pro-semibold-2.042"}, {"atlasVersion", 1}, {"inkMode", "chosen"},
        {"inkColor", 0xf2eee7}, {"groundColor", 0x151319}};
    if (type == "language-body") effect["languageBody"] = QJsonObject{{"kind", "language-body"},
        {"phrases", QJsonArray{"Almost", "Human"}}, {"phraseA", "Almost"}, {"phraseB", "Human"},
        {"flow", "organic"}, {"body", "figure"}, {"phraseLogic", "noise"}, {"composition", "field"},
        {"inkMode", "chosen"}, {"inkColor", 0xf2eee7}, {"groundColor", 0x050505}, {"loopMode", "held"}};
    if (type == "zhuyin-weave") effect["zhuyinField"] = QJsonObject{{"kind", "zhuyin"}, {"bank", "full"},
        {"glyphs", QJsonArray{"ㄅ", "ㄆ", "ㄇ", "ㄈ", "ㄉ", "ㄊ", "ㄋ", "ㄌ", "ㄍ", "ㄎ", "ㄏ", "ㄐ", "ㄑ", "ㄒ", "ㄓ", "ㄔ", "ㄕ", "ㄖ", "ㄗ", "ㄘ", "ㄙ", "ㄧ", "ㄨ", "ㄩ", "ㄚ", "ㄛ", "ㄜ", "ㄝ", "ㄞ", "ㄟ", "ㄠ", "ㄡ", "ㄢ", "ㄣ", "ㄤ", "ㄥ", "ㄦ"}},
        {"mutationMode", "held"}, {"spatialLogic", "weave"}, {"placement", "whole"}, {"composition", "inlay"},
        {"inkMode", "palette"}, {"inkColor", 0xf2eee7}, {"groundColor", 0x151319}};
    if (type == "petscii-study") effect["tileField"] = QJsonObject{{"kind", "petscii-study"}, {"tileLogic", "infection"},
        {"foregroundColor", 0x706deb}, {"backgroundColor", 0}};
    effect["parameters"] = parameters;
    return effect;
}

QJsonObject TempleRecipe::createForm(const QString &family) {
    QJsonObject parameters;
    for (const auto &value : catalog()["formParameters"].toArray()) {
        const auto parameter = value.toObject();
        parameters[parameter["id"].toString()] = parameter["default"];
    }
    parameters["figureActive"] = family == "human" ? 1 : 0;
    parameters["knotActive"] = family == "knot" ? 1 : 0;
    return {{"kind", "kone-form"}, {"family", family}, {"seed", QDateTime::currentMSecsSinceEpoch() % 2000000000},
        {"parameters", parameters}};
}

QJsonObject TempleRecipe::initial() {
    return {{"schemaVersion", 1}, {"revision", 1}, {"seed", 886}, {"colorSeed", 886042}, {"iteration", 0},
        {"renderSize", 1600}, {"renderWidth", 1600}, {"renderHeight", 1600}, {"gifWidth", 960}, {"gifHeight", 960},
        {"loopFrames", 36}, {"loopFps", 12}, {"aspectLocked", true}, {"gifAspectLocked", true},
        {"baseMode", "field"}, {"processStage", "chain"}, {"processingOrientation", "recompose"},
        {"koneForm", createForm("kone")}, {"sourceFit", "contain"}, {"sourceBackground", "keep"},
        {"colorMode", "source"}, {"sourcePresence", 0}, {"layers", QJsonArray{}},
        {"paletteSettings", QJsonObject{{"structure", "analogous"}, {"hue", 22}, {"hueSpread", 34},
            {"saturation", 28}, {"saturationRange", 18}, {"lightnessFloor", 8}, {"lightnessCeiling", 94}}},
        {"palette", QJsonArray{5912639, 11102555, 13744796, 15921901}}, {"effects", QJsonArray{}}};
}

bool TempleRecipe::validate(const QJsonObject &recipe, QString *error) {
    auto fail = [error](const QString &message) { if (error) *error = message; return false; };
    if (recipe["schemaVersion"].toInt() != 1 || !recipe["effects"].isArray() || !recipe["palette"].isArray())
        return fail(QStringLiteral("This is not a supported Temple recipe."));
    if (QJsonDocument(recipe).toJson(QJsonDocument::Compact).size() > 1024 * 1024)
        return fail(QStringLiteral("The recipe is too large."));
    for (const auto &value : recipe["effects"].toArray()) {
        const auto effect = value.toObject();
        if (definition(effect["type"].toString()).isEmpty()) return fail(QStringLiteral("Unknown Temple process: %1").arg(effect["type"].toString()));
    }
    return true;
}
