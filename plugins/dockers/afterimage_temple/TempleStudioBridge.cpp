// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#include "TempleStudioBridge.h"
#include "TempleRecipe.h"
#include "TempleService.h"
#include <KisDocument.h>
#include <QCoreApplication>
#include <QApplication>
#include <QClipboard>
#include <QCryptographicHash>
#include <QFutureWatcher>
#include <QDateTime>
#include <QDesktopServices>
#include <QDir>
#include <QDirIterator>
#include <QFile>
#include <QFileDialog>
#include <QFileInfo>
#include <QImageReader>
#include <QtConcurrentRun>
#include <QProcess>
#include <QRegularExpression>
#include <QJsonDocument>
#include <QSaveFile>
#include <QStandardPaths>
#include <QUrl>
#include <QUrlQuery>
#include <QUuid>
#include <algorithm>
#include <climits>
#include <memory>
#ifdef Q_OS_WIN
#include <objidl.h>
#endif

namespace {
QJsonObject readObject(const QString &path) {
    QFile file(path);
    return file.open(QIODevice::ReadOnly) ? QJsonDocument::fromJson(file.readAll()).object() : QJsonObject{};
}
bool writeObject(const QString &path, const QJsonObject &object) {
    if (!QDir().mkpath(QFileInfo(path).absolutePath())) return false;
    QSaveFile file(path);
    const QByteArray data = QJsonDocument(object).toJson(QJsonDocument::Indented);
    return file.open(QIODevice::WriteOnly) && file.write(data) == data.size() && file.commit();
}
QString assetUrl(const QString &path) {
    QUrl url(QStringLiteral("https://studio.afterimage.local/assets"));
    QUrlQuery query;
    query.addQueryItem(QStringLiteral("path"), path);
    url.setQuery(query);
    return url.toString(QUrl::FullyEncoded);
}
QString safeName(const QString &value) {
    QString result;
    for (const QChar character : value.trimmed().left(100))
        if (character.isLetterOrNumber() || character == QLatin1Char(' ') || character == QLatin1Char('-')
            || character == QLatin1Char('_')) result.append(character);
    return result.trimmed();
}
QString retainedCopy(const QString &source, const QString &directory, QString *error) {
    if (!QFileInfo::exists(source) || !QDir().mkpath(directory)) {
        if (error) *error = QStringLiteral("The protected source or destination is unavailable.");
        return {};
    }
    const QString extension = QFileInfo(source).suffix().toLower();
    const QString target = directory + QLatin1Char('/') + QUuid::createUuid().toString(QUuid::WithoutBraces)
        + QLatin1Char('.') + extension;
    if (!QFile::copy(source, target)) {
        if (error) *error = QStringLiteral("Could not preserve a copy of the selected material.");
        return {};
    }
    return target;
}
QJsonArray readArray(const QString &path) {
    QFile file(path);
    return file.open(QIODevice::ReadOnly) ? QJsonDocument::fromJson(file.readAll()).array() : QJsonArray{};
}
QJsonObject importEmojiFolder(const QString &sourcePath, const QString &root) {
    QDir source(sourcePath);
    if (!source.exists()) return {{"error", QStringLiteral("The chosen emoji folder is unavailable.")}};
    const QString canonicalSource = QDir::fromNativeSeparators(source.canonicalPath());
    const QString canonicalRoot = QDir::fromNativeSeparators(QFileInfo(root).absoluteFilePath());
    if (canonicalSource.compare(canonicalRoot, Qt::CaseInsensitive) == 0
        || canonicalRoot.startsWith(canonicalSource + QLatin1Char('/'), Qt::CaseInsensitive))
        return {{"error", QStringLiteral("Choose a source outside Temple's own emoji library.")}};
    if (!QDir().mkpath(root + QStringLiteral("/originals"))
        || !QDir().mkpath(root + QStringLiteral("/images"))
        || !QDir().mkpath(root + QStringLiteral("/thumbs")))
        return {{"error", QStringLiteral("Temple could not create its emoji library.")}};
    const QString indexPath = root + QStringLiteral("/index.json");
    QHash<QString, QJsonObject> entries;
    for (const auto &value : readObject(indexPath)["entries"].toArray()) {
        const QJsonObject item = value.toObject();
        if (!item["id"].toString().isEmpty()) entries.insert(item["id"].toString(), item);
    }
    int scanned = 0, imported = 0, duplicates = 0, failed = 0;
    QJsonArray failures;
    QDirIterator files(source.absolutePath(), {QStringLiteral("*.png"), QStringLiteral("*.jpg"),
        QStringLiteral("*.jpeg"), QStringLiteral("*.webp"), QStringLiteral("*.gif")},
        QDir::Files | QDir::NoSymLinks, QDirIterator::Subdirectories);
    while (files.hasNext()) {
        const QFileInfo info(files.next());
        ++scanned;
        const QString relative = QDir::fromNativeSeparators(source.relativeFilePath(info.absoluteFilePath()));
        auto failure = [&](const QString &why) {
            ++failed;
            if (failures.size() < 20) failures.append(QJsonObject{{"file", relative}, {"reason", why}});
        };
        if (info.size() > 100ll * 1024 * 1024) { failure(QStringLiteral("Image exceeds 100 MB.")); continue; }
        QFile input(info.absoluteFilePath());
        if (!input.open(QIODevice::ReadOnly)) { failure(QStringLiteral("Cannot read original.")); continue; }
        QCryptographicHash hash(QCryptographicHash::Sha256);
        if (!hash.addData(&input)) { failure(QStringLiteral("Cannot hash original.")); continue; }
        const QString key = QString::fromLatin1(hash.result().toHex());
        input.close();
        if (entries.contains(key)) {
            QJsonObject item = entries.value(key);
            QJsonArray aliases = item["aliases"].toArray();
            if (!aliases.contains(relative)) aliases.append(relative);
            item["aliases"] = aliases; entries.insert(key, item);
            ++duplicates; continue;
        }
        QImageReader reader(info.absoluteFilePath());
        reader.setAutoTransform(true);
        const bool animated = reader.imageCount() > 1;
        const QImage image = reader.read().convertToFormat(QImage::Format_RGBA8888);
        if (image.isNull()) { failure(QStringLiteral("Cannot decode image.")); continue; }
        const QString fullImage = root + QStringLiteral("/images/") + key + QStringLiteral(".png");
        const QString thumbnail = root + QStringLiteral("/thumbs/") + key + QStringLiteral(".png");
        const QString original = root + QStringLiteral("/originals/") + key + QLatin1Char('.') + info.suffix().toLower();
        QSaveFile imageFile(fullImage), thumbnailFile(thumbnail);
        if (!imageFile.open(QIODevice::WriteOnly) || !image.save(&imageFile, "PNG") || !imageFile.commit()
            || !thumbnailFile.open(QIODevice::WriteOnly)
            || !image.scaled(112, 112, Qt::KeepAspectRatio, Qt::SmoothTransformation).save(&thumbnailFile, "PNG")
            || !thumbnailFile.commit() || (!QFile::exists(original) && !QFile::copy(info.absoluteFilePath(), original))) {
            failure(QStringLiteral("Cannot retain image, thumbnail, or original.")); continue;
        }
        QString name = info.completeBaseName(); name.replace(QLatin1Char('_'), QLatin1Char(' '));
        name.replace(QLatin1Char('-'), QLatin1Char(' '));
        entries.insert(key, {{"id", key}, {"name", name}, {"aliases", QJsonArray{relative}},
            {"animated", animated}, {"width", image.width()}, {"height", image.height()}, {"original", original}});
        ++imported;
    }
    QList<QJsonObject> sorted = entries.values();
    std::sort(sorted.begin(), sorted.end(), [](const QJsonObject &a, const QJsonObject &b) {
        return a["name"].toString().compare(b["name"].toString(), Qt::CaseInsensitive) < 0;
    });
    QJsonArray serialized; for (const auto &entry : sorted) serialized.append(entry);
    const QJsonObject index{{"source", source.absolutePath()}, {"filesChecked", scanned},
        {"duplicates", duplicates}, {"entries", serialized}, {"failures", failures}};
    if (!writeObject(indexPath, index)) return {{"error", QStringLiteral("Temple could not save its emoji index.")}};
    return {{"filesChecked", scanned}, {"imported", imported}, {"duplicates", duplicates},
        {"failed", failed}, {"total", serialized.size()}, {"failures", failures}};
}
bool writeArray(const QString &path, const QJsonArray &array) {
    if (!QDir().mkpath(QFileInfo(path).absolutePath())) return false;
    QSaveFile file(path);
    const QByteArray data = QJsonDocument(array).toJson(QJsonDocument::Indented);
    return file.open(QIODevice::WriteOnly) && file.write(data) == data.size() && file.commit();
}
}

TempleStudioBridge::TempleStudioBridge(KisDocument *document, const QJsonObject &initialRecipe, QObject *parent)
    : QObject(parent), m_document(document)
{
    if (document) {
        const QString id = TempleService::instance()->documentId(document);
        m_recipe = TempleService::instance()->draftForDocument(id);
    }
    QString error;
    if (!TempleRecipe::validate(m_recipe, &error)) m_recipe = initialRecipe;
    if (!TempleRecipe::validate(m_recipe, &error)) m_recipe = TempleRecipe::initial();
    QDir().mkpath(workspace() + QStringLiteral("/outputs/gallery"));
    QDir().mkpath(workspace() + QStringLiteral("/curated-gallery"));
    m_outputs = readArray(workspace() + QStringLiteral("/outputs.json"));
}

QString TempleStudioBridge::workspace() const {
    return QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation) + QStringLiteral("/temple/studio");
}
QString TempleStudioBridge::documentId() const {
    return m_document ? TempleService::instance()->documentId(m_document) : QString();
}
QString TempleStudioBridge::readableAsset(const QString &path) const {
    const QFileInfo info(path);
    if (!info.isFile()) return {};
    const QString canonical = info.canonicalFilePath();
    const QString vault = QFileInfo(QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation)
        + QStringLiteral("/temple")).canonicalFilePath();
    if (!vault.isEmpty() && QDir::fromNativeSeparators(canonical).startsWith(
            QDir::fromNativeSeparators(vault) + QLatin1Char('/'), Qt::CaseInsensitive)) return canonical;
    for (const QString &allowed : m_allowedGalleryAssets)
        if (canonical.compare(allowed, Qt::CaseInsensitive) == 0) return canonical;
    return {};
}

QJsonObject TempleStudioBridge::snapshot() const {
    QFile manifest(QStringLiteral(":/afterimage/temple/resources/temple.json"));
    QJsonObject definition;
    if (manifest.open(QIODevice::ReadOnly)) definition = QJsonDocument::fromJson(manifest.readAll()).object();
    const QString source = m_recipe["sourceImage"].toString();
    QJsonArray boundOutputs;
    for (const auto &value : m_outputs) {
        const QJsonObject output = value.toObject();
        if (output["sourceDocumentId"].toString() == documentId()) boundOutputs.append(output);
    }
    const QString processingPath = QCoreApplication::applicationDirPath() + QStringLiteral("/processing");
    return {{"workspacePath", workspace()}, {"sketchPath", QStringLiteral("app-owned Processing engine")},
        {"processingPath", processingPath},
        {"manifest", definition}, {"current", QJsonObject{{"seed", m_recipe["seed"]},
            {"parameters", QJsonObject{}}, {"recipe", m_recipe}, {"sourceImage", source}}},
        {"sourcePreviewDataUrl", source.isEmpty() ? QJsonValue() : QJsonValue(assetUrl(source))},
        {"outputs", boundOutputs}, {"sourceRevision", 0}, {"latestError", QJsonValue()},
        {"rendering", m_rendering}, {"boundDocumentId", documentId()}};
}

QJsonObject TempleStudioBridge::outputRecord(const QString &id, const QString &kind,
                                              const QJsonObject &result, const QJsonObject &recipe) const {
    const QString path = result["path"].toString();
    return {{"id", id}, {"kind", kind}, {"filePath", path}, {"sourceDocumentId", documentId()},
        {"previewDataUrl", kind == QStringLiteral("mp4") ? QJsonValue() : QJsonValue(assetUrl(path))},
        {"sourceImage", recipe["sourceImage"]}, {"createdAt", QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs)},
        {"seed", recipe["seed"]}, {"parameters", QJsonObject{}}, {"recipe", recipe},
        {"width", result["width"]}, {"height", result["height"]}};
}
void TempleStudioBridge::rememberOutput(const QJsonObject &output) {
    m_outputs.prepend(output);
    while (m_outputs.size() > 100) m_outputs.removeLast();
    writeArray(workspace() + QStringLiteral("/outputs.json"), m_outputs);
}

#ifdef Q_OS_WIN
QJsonObject TempleStudioBridge::importStream(IStream *stream, const QString &name, QString *error) {
    if (!stream) { if (error) *error = QStringLiteral("No image bytes were received."); return {}; }
    const QString folder = workspace() + QStringLiteral("/materials");
    if (!QDir().mkpath(folder)) { if (error) *error = QStringLiteral("Temple material storage is unavailable."); return {}; }
    const QString suffix = QFileInfo(name).suffix().toLower();
    if (suffix != QStringLiteral("png") && suffix != QStringLiteral("jpg")
        && suffix != QStringLiteral("jpeg") && suffix != QStringLiteral("webp")) {
        if (error) *error = QStringLiteral("Choose a PNG, JPEG, or WebP image."); return {};
    }
    const QString path = folder + QLatin1Char('/') + QUuid::createUuid().toString(QUuid::WithoutBraces)
        + QLatin1Char('.') + suffix;
    QSaveFile file(path);
    if (!file.open(QIODevice::WriteOnly)) { if (error) *error = file.errorString(); return {}; }
    quint64 total = 0;
    while (true) {
        char block[65536]; ULONG read = 0;
        const HRESULT status = stream->Read(block, sizeof(block), &read);
        if (FAILED(status)) { file.cancelWriting(); if (error) *error = QStringLiteral("Could not read the selected image."); return {}; }
        if (read == 0) break;
        total += read;
        if (total > 100ull * 1024ull * 1024ull || file.write(block, read) != read) {
            file.cancelWriting(); if (error) *error = QStringLiteral("The selected image is too large or could not be retained."); return {};
        }
    }
    if (!file.commit()) { if (error) *error = file.errorString(); return {}; }
    QImageReader image(path);
    if (!image.canRead() || !image.size().isValid()) {
        QFile::remove(path); if (error) *error = QStringLiteral("The selected image is not readable."); return {};
    }
    return {{"filePath", path}, {"previewDataUrl", assetUrl(path)}};
}
#endif

void TempleStudioBridge::invoke(const QString &command, const QJsonObject &arguments, Reply reply) {
    auto fail = [&reply](const QString &message) { reply(false, QJsonValue(), message); };
    if (!m_document) { fail(QStringLiteral("The bound artwork has closed. Open Studio from an open document.")); return; }
    const QString id = documentId();
    auto *service = TempleService::instance();
    if (command == QStringLiteral("get_snapshot")) { reply(true, snapshot(), {}); return; }
    if (command == QStringLiteral("persist_live_draft")) {
        const QJsonObject request = arguments["request"].toObject();
        const QJsonObject recipe = request["recipe"].toObject();
        if (!service->saveDraft(id, recipe)) { fail(QStringLiteral("Could not save the Studio draft in its bound artwork.")); return; }
        m_recipe = recipe;
        const QString livePath = workspace() + QStringLiteral("/bridge/") + id + QStringLiteral("/live-studio.json");
        writeObject(livePath, {{"documentId", id}, {"seed", recipe["seed"]}, {"recipe", recipe},
            {"parameters", request["parameters"]}, {"sourceImage", request["sourceImage"]},
            {"updatedAt", QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs)}});
        emit recipeChanged(recipe);
        reply(true, QJsonObject{{"documentId", id}, {"revision", recipe["revision"]}}, {}); return;
    }
    if (command == QStringLiteral("bridge_paths")) {
        const QString base = workspace() + QStringLiteral("/bridge/") + id;
        const QString liveStudio = base + QStringLiteral("/live-studio.json");
        const QString pendingCommand = base + QStringLiteral("/pending-command.json");
        const QString acknowledgement = base + QStringLiteral("/acknowledgement.json");
        reply(true, QJsonObject{{"liveStudio", liveStudio}, {"pendingCommand", pendingCommand},
            {"acknowledgement", acknowledgement}}, {}); return;
    }
    if (command == QStringLiteral("render")) {
        const QJsonObject request = arguments["request"].toObject();
        const QJsonObject recipe = request["recipe"].toObject();
        const QString kind = request["kind"].toString();
        const bool galleryOutput = request["outputScope"].toString() == QStringLiteral("gallery");
        if (kind != QStringLiteral("still") && kind != QStringLiteral("gif") && kind != QStringLiteral("mp4")) {
            fail(QStringLiteral("Choose PNG, GIF, or MP4.")); return;
        }
        m_rendering = true;
        auto expected = std::make_shared<QString>();
        auto connection = std::make_shared<QMetaObject::Connection>();
        if (kind == QStringLiteral("still")) {
            *connection = connect(service, &TempleService::renderFinished, this,
                [this, expected, connection, reply, recipe, galleryOutput, request](const QString &finished, const QJsonObject &result) {
                    if (finished != *expected) return;
                    QObject::disconnect(*connection); m_rendering = false; m_activeRequestId.clear();
                    if (result.contains("error")) { reply(false, QJsonValue(), result["error"].toString()); return; }
                    if (result["fullSize"].toBool()) m_lastFullRender = finished;
                    QJsonObject ownedResult = result;
                    if (galleryOutput) {
                        QString error;
                        const QString name = safeName(QFileInfo(request["outputName"].toString()).completeBaseName());
                        const QString gallery = workspace() + QStringLiteral("/outputs/gallery");
                        const QString target = gallery + QLatin1Char('/')
                            + (name.isEmpty() ? QStringLiteral("gallery") : name) + QLatin1Char('-')
                            + finished.left(8) + QStringLiteral(".png");
                        if (!QDir().mkpath(gallery) || !QFile::copy(result["path"].toString(), target)) {
                            reply(false, QJsonValue(), QStringLiteral("The Processing PNG rendered, but could not be kept in the Gallery folder.")); return;
                        }
                        ownedResult["path"] = target;
                    }
                    const QJsonObject output = outputRecord(finished, QStringLiteral("still"), ownedResult, recipe);
                    rememberOutput(output);
                    reply(true, QJsonObject{{"output", output}, {"stdout", QStringLiteral("Native Temple Processing engine")}}, {});
                });
            const QSize requested(request["width"].toInt(), request["height"].toInt());
            if (requested.width() < 64 || requested.height() < 64
                || requested.width() > 6000 || requested.height() > 6000) {
                QObject::disconnect(*connection); m_rendering = false;
                fail(QStringLiteral("Processing PNG dimensions must each be between 64 and 6000 pixels.")); return;
            }
            *expected = service->renderRecipe(id, recipe, 0, requested);
            m_activeRequestId = *expected;
        } else {
            *connection = connect(service, &TempleService::loopFinished, this,
                [this, expected, connection, reply, recipe, kind](const QString &finished, const QJsonObject &result) {
                    if (finished != *expected) return;
                    QObject::disconnect(*connection); m_rendering = false; m_activeRequestId.clear();
                    if (result.contains("error")) { reply(false, QJsonValue(), result["error"].toString()); return; }
                    QJsonObject dimensions = result;
                    dimensions["width"] = result["width"].toInt(recipe["gifWidth"].toInt());
                    dimensions["height"] = result["height"].toInt(recipe["gifHeight"].toInt());
                    const QJsonObject output = outputRecord(finished, kind, dimensions, recipe);
                    rememberOutput(output);
                    reply(true, QJsonObject{{"output", output}, {"stdout", QStringLiteral("Native Temple Processing/FFmpeg")}}, {});
                });
            QString outputPath;
            if (galleryOutput) {
                const QString gallery = workspace() + QStringLiteral("/outputs/gallery");
                if (!QDir().mkpath(gallery)) {
                    QObject::disconnect(*connection); m_rendering = false;
                    fail(QStringLiteral("The Gallery output folder is unavailable.")); return;
                }
                const QString base = safeName(QFileInfo(request["outputName"].toString()).completeBaseName());
                outputPath = gallery + QLatin1Char('/')
                    + (base.isEmpty() ? QStringLiteral("gallery") : base) + QLatin1Char('-')
                    + QUuid::createUuid().toString(QUuid::WithoutBraces).left(8) + QLatin1Char('.') + kind;
            }
            *expected = service->exportLoop(id, recipe, kind, outputPath);
            m_activeRequestId = *expected;
        }
        return;
    }
    if (command == QStringLiteral("apply_render")) {
        if (m_lastFullRender.isEmpty()) { fail(QStringLiteral("Render this recipe at the native document size before applying.")); return; }
        if (arguments["renderId"].toString() != m_lastFullRender) {
            fail(QStringLiteral("The selected master is not the latest full-size render for this bound artwork.")); return;
        }
        const QString renderId = m_lastFullRender;
        auto connection = std::make_shared<QMetaObject::Connection>();
        *connection = connect(service, &TempleService::applyFinished, this,
            [connection, renderId, reply](const QString &finished, const QJsonObject &result) {
                if (finished != renderId) return;
                QObject::disconnect(*connection);
                reply(!result.contains("error"), result, result["error"].toString());
            });
        service->applyRender(renderId); return;
    }
    if (command == QStringLiteral("render_apply")) {
        const QJsonObject recipe = arguments["recipe"].toObject();
        m_rendering = true;
        auto expected = std::make_shared<QString>();
        auto renderConnection = std::make_shared<QMetaObject::Connection>();
        *renderConnection = connect(service, &TempleService::renderFinished, this,
            [this, service, expected, renderConnection, reply](const QString &finished, const QJsonObject &result) {
                if (finished != *expected) return;
                QObject::disconnect(*renderConnection);
                m_activeRequestId.clear();
                if (result.contains("error")) {
                    m_rendering = false; reply(false, QJsonValue(), result["error"].toString()); return;
                }
                m_lastFullRender = finished;
                auto applyConnection = std::make_shared<QMetaObject::Connection>();
                *applyConnection = connect(service, &TempleService::applyFinished, this,
                    [this, applyConnection, finished, reply](const QString &applied, const QJsonObject &applyResult) {
                        if (applied != finished) return;
                        QObject::disconnect(*applyConnection);
                        m_rendering = false;
                        reply(!applyResult.contains("error"), applyResult, applyResult["error"].toString());
                    });
                service->applyRender(finished);
            });
        *expected = service->renderRecipe(id, recipe, 0);
        m_activeRequestId = *expected;
        return;
    }
    if (command == QStringLiteral("render_progress")) {
        reply(true, QJsonObject{{"completedFrames", 0}, {"totalFrames", m_recipe["loopFrames"].toInt(36)},
            {"encoding", false}, {"rendering", m_rendering}}, {}); return;
    }
    if (command == QStringLiteral("cancel_render")) {
        if (m_activeRequestId.isEmpty()) { reply(true, QJsonValue(), {}); return; }
        service->cancelRequest(m_activeRequestId);
        reply(true, QJsonObject{{"status", "cancelling"}, {"requestId", m_activeRequestId}}, {}); return;
    }
    if (command == QStringLiteral("preview_material")) {
        const QString path = readableAsset(arguments["path"].toString());
        if (path.isEmpty()) { fail(QStringLiteral("That Temple material is unavailable.")); return; }
        reply(true, assetUrl(path), {}); return;
    }
    if (command == QStringLiteral("import_image")) {
        const QString path = readableAsset(arguments["request"].toObject()["filePath"].toString());
        if (path.isEmpty()) { fail(QStringLiteral("Upload the selected image to Temple before importing it.")); return; }
        reply(true, QJsonObject{{"filePath", path}, {"previewDataUrl", assetUrl(path)}}, {}); return;
    }
    if (command == QStringLiteral("load_palette_library")) {
        const QJsonObject saved = readObject(workspace() + QStringLiteral("/palettes.json"));
        reply(true, saved.isEmpty() ? QJsonObject{{"version", 1}, {"sets", QJsonArray{}}, {"favorites", QJsonArray{}}} : saved, {}); return;
    }
    if (command == QStringLiteral("save_palette_library")) {
        if (!writeObject(workspace() + QStringLiteral("/palettes.json"), arguments["library"].toObject())) {
            fail(QStringLiteral("Could not save the Temple palette library.")); return;
        }
        reply(true, QJsonValue(), {}); return;
    }
    if (command == QStringLiteral("export_palette_library")) {
        if (!writeObject(arguments["path"].toString(), arguments["library"].toObject())) {
            fail(QStringLiteral("Could not export the Temple palette library.")); return;
        }
        reply(true, QJsonValue(), {}); return;
    }
    if (command == QStringLiteral("feed_preview_as_source")) {
        const QJsonObject request = arguments["request"].toObject();
        const QString source = readableAsset(request["filePath"].toString());
        if (source.isEmpty()) { fail(QStringLiteral("The held frame is unavailable for feedback.")); return; }
        QString error;
        const QString path = retainedCopy(source, workspace() + QStringLiteral("/materials"), &error);
        if (path.isEmpty()) { fail(error); return; }
        writeObject(path + QStringLiteral(".json"), {{"parentSource", request["parentSource"]},
            {"recipe", request["recipe"]}, {"retainChain", request["retainChain"]},
            {"createdAt", QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs)}});
        reply(true, QJsonObject{{"filePath", path}, {"previewDataUrl", assetUrl(path)}}, {}); return;
    }
    if (command == QStringLiteral("preserve_preview")) {
        const QJsonObject request = arguments["request"].toObject();
        const QString source = readableAsset(request["filePath"].toString());
        if (source.isEmpty()) { fail(QStringLiteral("The held preview is unavailable.")); return; }
        QString error;
        const QString path = retainedCopy(source, workspace() + QStringLiteral("/outputs"), &error);
        if (path.isEmpty()) { fail(error); return; }
        const QString outputId = QUuid::createUuid().toString(QUuid::WithoutBraces);
        const QJsonObject result{{"path", path}, {"width", request["width"]}, {"height", request["height"]}};
        const QJsonObject output = outputRecord(outputId, QStringLiteral("capture"), result, request["recipe"].toObject());
        rememberOutput(output);
        reply(true, QJsonObject{{"output", output}, {"stdout", QStringLiteral("Held Studio preview saved exactly")}}, {}); return;
    }
    if (command == QStringLiteral("capture_ascii_text")) {
        const QJsonObject request = arguments["request"].toObject();
        const QString text = request["text"].toString();
        const int columns = request["columns"].toInt(), rows = request["rows"].toInt();
        const QStringList lines = text.split(QStringLiteral("\r\n"));
        if (columns < 1 || columns > 4096 || rows < 1 || rows > 4096 || lines.size() != rows
            || text.size() > 16 * 1024 * 1024 || request["fontAsset"] != QStringLiteral("source-code-pro-semibold-2.042")
            || request["atlasVersion"].toInt() != 1) {
            fail(QStringLiteral("The ASCII capture no longer matches its printable grid.")); return;
        }
        for (const QString &line : lines) {
            if (line.size() != columns) { fail(QStringLiteral("The ASCII capture has an incomplete row.")); return; }
            for (const QChar character : line) if (character.unicode() < 32 || character.unicode() > 126) {
                fail(QStringLiteral("ASCII capture accepts printable ASCII only.")); return;
            }
        }
        const QString folder = workspace() + QStringLiteral("/outputs/ascii");
        QDir().mkpath(folder);
        const QString path = folder + QLatin1Char('/') + QUuid::createUuid().toString(QUuid::WithoutBraces) + QStringLiteral(".txt");
        QSaveFile file(path);
        const QByteArray bytes = text.toLatin1();
        if (!file.open(QIODevice::WriteOnly) || file.write(bytes) != bytes.size() || !file.commit()) {
            fail(QStringLiteral("Could not preserve the printable ASCII grid.")); return;
        }
        writeObject(path + QStringLiteral(".json"), {{"recipe", request["recipe"]}, {"sourceImage", request["sourceImage"]},
            {"seed", request["seed"]}, {"columns", columns}, {"rows", rows},
            {"fontAsset", request["fontAsset"]}, {"atlasVersion", 1}});
        const QString metadataPath = path + QStringLiteral(".json");
        reply(true, QJsonObject{{"filePath", path}, {"metadataPath", metadataPath}}, {}); return;
    }
    if (command == QStringLiteral("list_process_recipes")) {
        QJsonArray records;
        const QDir directory(workspace() + QStringLiteral("/process-recipes"));
        for (const QFileInfo &file : directory.entryInfoList({QStringLiteral("*.json")}, QDir::Files, QDir::Time)) {
            QJsonObject record = readObject(file.absoluteFilePath());
            if (record.isEmpty()) continue;
            record["path"] = file.absoluteFilePath(); records.append(record);
        }
        reply(true, records, {}); return;
    }
    if (command == QStringLiteral("save_process_recipe")) {
        const QString name = safeName(arguments["name"].toString());
        const QString scope = arguments["scope"].toString();
        if (name.isEmpty() || (scope != QStringLiteral("glitch-steps") && scope != QStringLiteral("ultimate-sort-mix"))) {
            fail(QStringLiteral("Name a Steps or Mix process recipe.")); return;
        }
        const QString directory = workspace() + QStringLiteral("/process-recipes");
        QDir().mkpath(directory);
        const QString path = directory + QLatin1Char('/') + name + QLatin1Char('-')
            + QUuid::createUuid().toString(QUuid::WithoutBraces).left(8) + QStringLiteral(".json");
        const QJsonObject record{{"name", arguments["name"]}, {"scope", scope},
            {"createdAt", QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs)},
            {"path", path}, {"payload", arguments["payload"]}};
        if (!writeObject(path, record)) { fail(QStringLiteral("Could not preserve the process recipe.")); return; }
        reply(true, record, {}); return;
    }
    if (command == QStringLiteral("save_state")) {
        const QString name = safeName(arguments["name"].toString());
        if (name.isEmpty()) { fail(QStringLiteral("Name this branch before preserving it.")); return; }
        const QString directory = workspace() + QStringLiteral("/states");
        QDir().mkpath(directory);
        const QString path = directory + QLatin1Char('/') + name + QLatin1Char('-')
            + QUuid::createUuid().toString(QUuid::WithoutBraces).left(8) + QStringLiteral(".json");
        const QJsonObject recipe = arguments["recipe"].toObject();
        QString validationError;
        if (!TempleRecipe::validate(recipe, &validationError)) { fail(validationError); return; }
        if (!writeObject(path, {{"name", arguments["name"]}, {"documentId", id},
            {"recipe", recipe}, {"createdAt", QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs)}})) {
            fail(QStringLiteral("Could not preserve this branch.")); return;
        }
        reply(true, QJsonObject{{"name", arguments["name"]}, {"path", path}}, {}); return;
    }
    if (command == QStringLiteral("dialog_open")) {
        const QJsonObject options = arguments["options"].toObject();
        QString path;
        if (options["directory"].toBool()) path = QFileDialog::getExistingDirectory(nullptr, QStringLiteral("Choose Temple gallery"),
            options["defaultPath"].toString(workspace()));
        else path = QFileDialog::getOpenFileName(nullptr, QStringLiteral("Choose Temple material"),
            options["defaultPath"].toString(workspace()));
        reply(true, path.isEmpty() ? QJsonValue() : QJsonValue(path), {}); return;
    }
    if (command == QStringLiteral("dialog_save")) {
        const QString path = QFileDialog::getSaveFileName(nullptr, QStringLiteral("Save Temple file"),
            arguments["options"].toObject()["defaultPath"].toString(workspace()));
        reply(true, path.isEmpty() ? QJsonValue() : QJsonValue(path), {}); return;
    }
    if (command == QStringLiteral("open_in_explorer")) {
        const QString path = arguments["path"].toString();
        if (!QFileInfo::exists(path)) { fail(QStringLiteral("That Temple file or folder is unavailable.")); return; }
        const bool opened = QFileInfo(path).isDir() ? QDesktopServices::openUrl(QUrl::fromLocalFile(path))
            : QProcess::startDetached(QStringLiteral("explorer.exe"), {QStringLiteral("/select,"), QDir::toNativeSeparators(path)});
        if (!opened) { fail(QStringLiteral("Explorer could not open that Temple path.")); return; }
        reply(true, QJsonValue(), {}); return;
    }
    if (command == QStringLiteral("copy_context")) {
        const QString latest = m_outputs.isEmpty() ? QStringLiteral("none")
            : m_outputs.first().toObject()["filePath"].toString();
        const QString context = QStringLiteral("Glitch Temple current experiment\nBound Afterimage document: %1\n"
            "Seed: %2\nRecipe revision: %3\nLatest output: %4\nStudio workspace: %5")
            .arg(id, QString::number(m_recipe["seed"].toInt()),
                QString::number(m_recipe["revision"].toInt()), latest, workspace());
        reply(true, context, {}); return;
    }
    if (command == QStringLiteral("clear_source_image")) {
        m_recipe["sourceImage"] = QJsonValue();
        service->saveDraft(id, m_recipe);
        emit recipeChanged(m_recipe);
        reply(true, QJsonValue(), {}); return;
    }
    if (command == QStringLiteral("get_pending_studio_command")) {
        const QJsonObject pending = readObject(workspace() + QStringLiteral("/bridge/") + id
            + QStringLiteral("/pending-command.json"));
        reply(true, pending["documentId"].toString() == id ? QJsonValue(pending) : QJsonValue(), {}); return;
    }
    if (command == QStringLiteral("acknowledge_studio_command")) {
        const QString base = workspace() + QStringLiteral("/bridge/") + id;
        const QString path = base + QStringLiteral("/pending-command.json");
        const QJsonObject pending = readObject(path);
        if (pending["documentId"].toString() == id && pending["id"] == arguments["commandId"]) {
            writeObject(base + QStringLiteral("/acknowledgement.json"), arguments);
            QFile::remove(path);
        }
        reply(true, QJsonValue(), {}); return;
    }
    if (command == QStringLiteral("get_curated_gallery")) {
        const QString folder = arguments["galleryPath"].toString();
        const QDir gallery(folder);
        if (!gallery.exists()) { fail(QStringLiteral("That gallery folder is unavailable.")); return; }
        const QString orderPath = workspace() + QStringLiteral("/gallery-order-")
            + QString::fromLatin1(QCryptographicHash::hash(gallery.canonicalPath().toUtf8(), QCryptographicHash::Sha256).toHex())
            + QStringLiteral(".json");
        const QJsonArray savedOrder = readArray(orderPath);
        QStringList order;
        for (const auto &value : savedOrder) order.append(value.toString());
        QFileInfoList files;
        QDirIterator scan(gallery.absolutePath(), {QStringLiteral("*.png"), QStringLiteral("*.jpg"),
            QStringLiteral("*.jpeg"), QStringLiteral("*.webp"), QStringLiteral("*.gif")},
            QDir::Files | QDir::NoSymLinks, QDirIterator::Subdirectories);
        while (scan.hasNext() && files.size() < 2000) {
            const QFileInfo file(scan.next());
            if (gallery.relativeFilePath(file.absoluteFilePath()).count(QLatin1Char('/')) <= 8) files.append(file);
        }
        auto galleryId = [&gallery](const QFileInfo &file) {
            const QString relative = QDir::fromNativeSeparators(gallery.relativeFilePath(file.absoluteFilePath()));
            return relative.contains(QLatin1Char('/')) ? relative : file.completeBaseName();
        };
        std::sort(files.begin(), files.end(), [&order, &galleryId](const QFileInfo &left, const QFileInfo &right) {
            const int a = order.indexOf(galleryId(left)), b = order.indexOf(galleryId(right));
            if (a >= 0 || b >= 0) return (a >= 0 ? a : INT_MAX) < (b >= 0 ? b : INT_MAX);
            return left.lastModified() > right.lastModified();
        });
        QJsonArray entries;
        for (const QFileInfo &file : files.mid(0, 80)) {
            const QString path = file.canonicalFilePath();
            m_allowedGalleryAssets.append(path);
            QJsonObject record{{"id", galleryId(file)},
                {"name", file.fileName()}, {"filePath", path}, {"previewDataUrl", assetUrl(path)}};
            for (const auto &value : m_outputs) if (value.toObject()["filePath"].toString() == path) {
                record["output"] = value; break;
            }
            entries.append(record);
        }
        reply(true, entries, {}); return;
    }
    if (command == QStringLiteral("save_curated_gallery_order")) {
        const QDir gallery(arguments["galleryPath"].toString());
        if (!gallery.exists()) { fail(QStringLiteral("That gallery folder is unavailable.")); return; }
        const QString path = workspace() + QStringLiteral("/gallery-order-")
            + QString::fromLatin1(QCryptographicHash::hash(gallery.canonicalPath().toUtf8(), QCryptographicHash::Sha256).toHex())
            + QStringLiteral(".json");
        if (!writeArray(path, arguments["order"].toArray())) { fail(QStringLiteral("Could not preserve the gallery order.")); return; }
        reply(true, arguments["order"], {}); return;
    }
    if (command == QStringLiteral("import_emoji_library")) {
        if (m_importingEmoji) { fail(QStringLiteral("An emoji folder is already being imported.")); return; }
        const QString folder = arguments["folder"].toString();
        if (!QFileInfo(folder).isDir()) { fail(QStringLiteral("Choose an existing image folder.")); return; }
        m_importingEmoji = true;
        auto *watcher = new QFutureWatcher<QJsonObject>(this);
        connect(watcher, &QFutureWatcher<QJsonObject>::finished, this, [this, watcher, reply] {
            const QJsonObject result = watcher->result();
            watcher->deleteLater(); m_importingEmoji = false;
            reply(!result.contains("error"), result, result["error"].toString());
        });
        const QString root = workspace() + QStringLiteral("/sources/emoji-library");
        watcher->setFuture(QtConcurrent::run([folder, root] { return importEmojiFolder(folder, root); }));
        return;
    }
    if (command == QStringLiteral("list_emoji_library")) {
        const QString root = workspace() + QStringLiteral("/sources/emoji-library");
        QJsonObject index = readObject(root + QStringLiteral("/index.json"));
        QJsonArray entries;
        for (const auto &value : index["entries"].toArray()) {
            QJsonObject entry = value.toObject();
            const QString emojiId = entry["id"].toString();
            if (!QRegularExpression(QStringLiteral("^[a-fA-F0-9]{64}$")).match(emojiId).hasMatch()) continue;
            const QString thumbnail = root + QStringLiteral("/thumbs/") + emojiId + QStringLiteral(".png");
            entry["thumbnail"] = thumbnail;
            entries.append(entry);
        }
        reply(true, QJsonObject{{"entries", entries}}, {}); return;
    }
    if (command == QStringLiteral("select_emoji_library")) {
        const QString emojiId = arguments["id"].toString();
        if (!QRegularExpression(QStringLiteral("^[a-fA-F0-9]{64}$")).match(emojiId).hasMatch()) {
            fail(QStringLiteral("That library image ID is invalid.")); return;
        }
        const QString path = workspace() + QStringLiteral("/sources/emoji-library/images/") + emojiId + QStringLiteral(".png");
        if (readableAsset(path).isEmpty()) { fail(QStringLiteral("That library image is unavailable.")); return; }
        reply(true, QJsonObject{{"filePath", path}, {"previewDataUrl", assetUrl(path)}}, {}); return;
    }
    if (command == QStringLiteral("read_effect_source")) {
        const QString type = arguments["effectType"].toString();
        const QHash<QString, QString> functions{{"band-rupture", "bandRupture"}, {"wrong-sort", "wrongSort"},
            {"median-filter", "medianFilter"}, {"sorting-motion", "sortingMotion"}, {"ultimate-sort", "ultimateSort"},
            {"wizprocess", "wizprocess"}, {"wavelet-chamber", "wizprocess"}, {"wavelet-cartography", "waveletCartography"},
            {"pixel-drift", "pixelDrift"}, {"signal-echo", "signalEcho"}, {"dither-field", "ditherField"},
            {"parliament-of-pixels", "parliamentOfPixels"}, {"tectonic-lens", "tectonicLens"}, {"lens-warp", "lensWarp"},
            {"kone-form", "koneForm"}, {"mirror-cut", "mirrorCut"}, {"motion-leak", "motionLeak"},
            {"resolution-quilt", "resolutionQuilt"}, {"shard-field", "shardField"}, {"cut-repeat", "cutRepeat"},
            {"language-body", "languageBody"}, {"ascii-field", "asciiField"}, {"zhuyin-weave", "zhuyinWeave"},
            {"petscii-study", "petsciiStudy"}, {"pcm-possession", "audioBending"}, {"tape-transport", "audioBending"},
            {"phase-choir", "audioBending"}, {"spectral-surgery", "audioBending"}, {"echo-architecture", "audioBending"},
            {"clip-furnace", "audioBending"}, {"silence-knife", "audioBending"}};
        const QString functionName = functions.value(type);
        if (functionName.isEmpty()) { fail(QStringLiteral("That process has no bundled Processing source.")); return; }
        const QString fileName = functionName == QStringLiteral("audioBending")
            ? QStringLiteral("AudioBending.pde") : QStringLiteral("TempleSeed.pde");
        QFile resource(QStringLiteral(":/afterimage/temple/resources/") + fileName);
        if (!resource.open(QIODevice::ReadOnly)) { fail(QStringLiteral("The bundled Processing source is unavailable.")); return; }
        const QByteArray bytes = resource.readAll();
        const QStringList lines = QString::fromUtf8(bytes).split(QLatin1Char('\n'));
        int start = -1, end = -1, depth = 0;
        const QRegularExpression signature(QStringLiteral("\\b") + QRegularExpression::escape(functionName) + QStringLiteral("\\s*\\("));
        for (int index = 0; index < lines.size(); ++index) {
            if (start < 0 && signature.match(lines[index]).hasMatch()) start = index;
            if (start < 0) continue;
            for (const QChar c : lines[index]) { if (c == QLatin1Char('{')) ++depth; else if (c == QLatin1Char('}')) --depth; }
            if (depth == 0 && index > start) { end = index; break; }
        }
        if (start < 0) { fail(QStringLiteral("That Processing function was not found.")); return; }
        if (end < start) end = qMin(lines.size() - 1, start + 100);
        const QString directory = workspace() + QStringLiteral("/source"); QDir().mkpath(directory);
        const QString extracted = directory + QLatin1Char('/') + fileName;
        QFile file(extracted);
        if (!file.exists() && file.open(QIODevice::WriteOnly)) file.write(bytes);
        reply(true, QJsonObject{{"effectType", type}, {"functionName", functionName}, {"filePath", extracted},
            {"startLine", start + 1}, {"endLine", end + 1}, {"code", lines.mid(start, end - start + 1).join(QLatin1Char('\n'))}}, {}); return;
    }
    fail(QStringLiteral("Temple Studio command %1 has no native implementation yet.").arg(command));
}
