// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#include "TempleService.h"
#include "TempleRecipe.h"
#include <KisDocument.h>
#include <KisPart.h>
#include <kis_paint_device.h>
#include <kis_paint_layer.h>
#include <kis_group_layer.h>
#include <kis_annotation.h>
#include <kis_processing_applicator.h>
#include <commands/kis_image_layer_add_command.h>
#include <QCoreApplication>
#include <QCryptographicHash>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QFutureWatcher>
#include <QImageReader>
#include <QElapsedTimer>
#include <QThread>
#include <QJsonDocument>
#include <QProcess>
#include <QSaveFile>
#include <QStandardPaths>
#include <QTemporaryDir>
#include <QTimer>
#include <QUuid>
#include <QtConcurrentRun>
#include <chrono>
#include <future>
#include <mutex>
#ifdef Q_OS_WIN
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#endif

namespace {
QString engineRoot() {
    const QString explicitRoot = qEnvironmentVariable("AFTERIMAGE_TEMPLE_PROCESSING_ROOT");
    if (!explicitRoot.isEmpty()) return explicitRoot;
    return QCoreApplication::applicationDirPath() + "/processing";
}
QString workspace() {
    return QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation) + "/temple";
}
QStringList resourceFiles() {
    return {"TempleSeed.pde", "AudioBending.pde", "FormStructure.pde", "FigureGroups.pde", "FigureComposition.pde",
        "Knot.pde", "TimeScore.pde", "temple.json", "symbol-atlas.json", "OpenMoji-LICENSE.txt",
        "data/ascii-atlas.json", "data/SourceCodePro-Semibold.ttf", "data/SourceCodePro-LICENSE.md"};
}
bool writeBytes(const QString &path, const QByteArray &bytes) {
    if (!QDir().mkpath(QFileInfo(path).absolutePath())) return false;
    QSaveFile file(path);
    return file.open(QIODevice::WriteOnly) && file.write(bytes) == bytes.size() && file.commit();
}
QJsonValue embedMaterialValues(const QJsonValue &value, const QString &field, KisImageSP image) {
    if (value.isObject()) {
        QJsonObject object = value.toObject();
        for (auto it = object.begin(); it != object.end(); ++it)
            it.value() = embedMaterialValues(it.value(), it.key(), image);
        return object;
    }
    if (value.isArray()) {
        QJsonArray array = value.toArray();
        for (int i = 0; i < array.size(); ++i) array.replace(i, embedMaterialValues(array[i], field, image));
        return array;
    }
    if (!value.isString() || (field != "filePath" && field != "sourceImage")) return value;
    QFile file(value.toString());
    if (!file.open(QIODevice::ReadOnly)) return value;
    const QByteArray bytes = file.readAll();
    if (bytes.isEmpty()) return value;
    const QString digest = QString::fromLatin1(QCryptographicHash::hash(bytes, QCryptographicHash::Sha256).toHex());
    const QString type = QStringLiteral("afterimage-temple-asset-") + digest;
    if (!image->annotation(type)) image->addAnnotation(new KisAnnotation(type, QFileInfo(file).fileName(), bytes));
    QString extension = QFileInfo(file).suffix().toLower();
    if (extension.isEmpty()) extension = QStringLiteral("png");
    const QString reference = QStringLiteral("temple-asset:") + digest + "." + extension;
    return QJsonValue(reference);
}
QJsonValue restoreMaterialValues(const QJsonValue &value, KisImageSP image, bool *missing) {
    if (value.isObject()) {
        QJsonObject object = value.toObject();
        for (auto it = object.begin(); it != object.end(); ++it)
            it.value() = restoreMaterialValues(it.value(), image, missing);
        return object;
    }
    if (value.isArray()) {
        QJsonArray array = value.toArray();
        for (int i = 0; i < array.size(); ++i) array.replace(i, restoreMaterialValues(array[i], image, missing));
        return array;
    }
    if (!value.isString() || !value.toString().startsWith("temple-asset:")) return value;
    const QString name = value.toString().mid(13);
    const int dot = name.indexOf('.');
    const QString digest = name.left(dot);
    const QString extension = name.mid(dot + 1);
    if (dot != 64 || digest.size() != 64 || extension.isEmpty() || extension.contains('/') || extension.contains('\\')) {
        *missing = true; return value;
    }
    const QString path = QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation)
        + "/temple/materials/" + digest + "." + extension;
    if (QFileInfo::exists(path)) return path;
    const auto annotation = image->annotation(QStringLiteral("afterimage-temple-asset-") + digest);
    if (!annotation || QString::fromLatin1(QCryptographicHash::hash(annotation->annotation(), QCryptographicHash::Sha256).toHex()) != digest
        || !writeBytes(path, annotation->annotation())) {
        *missing = true; return value;
    }
    return path;
}
QString prepareSketch(const QString &workRoot) {
    const QString sketch = workRoot + "/TempleSeed";
    for (const QString &name : resourceFiles()) {
        QFile resource(":/afterimage/temple/resources/" + name);
        if (!resource.open(QIODevice::ReadOnly) || !writeBytes(sketch + "/" + name, resource.readAll()))
            return QStringLiteral("Could not prepare the bundled Temple renderer: %1").arg(name);
    }
    return {};
}
#ifdef Q_OS_WIN
QString quoted(const QString &input) {
    QString result = "\"";
    int slashes = 0;
    for (const QChar ch : input) {
        if (ch == '\\') { ++slashes; continue; }
        if (ch == '"') { result += QString(slashes * 2 + 1, '\\') + '"'; slashes = 0; continue; }
        result += QString(slashes, '\\') + ch;
        slashes = 0;
    }
    result += QString(slashes * 2, '\\') + '"';
    return result;
}
class PrivateRenderer {
public:
    ~PrivateRenderer() { stop(); }
    QString submit(const QString &root, const QJsonObject &request, int timeoutMs) {
        // The engine is one private instrument. Serialize actual work, while
        // the dock coalesces intermediate edits and the UI remains responsive.
        std::lock_guard<std::mutex> guard(m_lock);
        if (!m_process.hProcess || WaitForSingleObject(m_process.hProcess, 0) != WAIT_TIMEOUT) {
            stop();
            const QString error = start(root);
            if (!error.isEmpty()) return error;
        }
        const QString sketch = m_root + "/TempleSeed";
        QFile::remove(sketch + "/response.json");
        if (!writeBytes(sketch + "/request.json", QJsonDocument(request).toJson(QJsonDocument::Compact)))
            return QStringLiteral("The persistent Temple request could not be written.");
        QElapsedTimer clock;
        clock.start();
        while (clock.elapsed() < timeoutMs) {
            QFile response(sketch + "/response.json");
            if (response.open(QIODevice::ReadOnly)) {
                const auto object = QJsonDocument::fromJson(response.readAll()).object();
                response.close();
                if (!object.isEmpty() && object["requestId"] == request["requestId"]) {
                    QFile::remove(response.fileName());
                    return object["error"].toString();
                }
            }
            if (WaitForSingleObject(m_process.hProcess, 0) != WAIT_TIMEOUT)
                return QStringLiteral("Temple's private renderer exited. See %1").arg(m_logPath);
            QThread::msleep(40);
        }
        stop();
        return QStringLiteral("Temple rendering exceeded the time limit. See %1").arg(m_logPath);
    }
private:
    QString start(const QString &root) {
        const QString app = root + "/app";
        const QString java = app + "/resources/jdk/bin/java.exe";
        if (!QFileInfo::exists(java) || QDir(app).entryList({"app-4.5.6-*.jar"}, QDir::Files).isEmpty())
            return QStringLiteral("The app-owned Processing 4.5.6 runtime is missing at %1.").arg(root);
        m_root = workspace() + "/engine-session-" + QString::number(QCoreApplication::applicationPid());
        if (!QDir().mkpath(m_root)) return QStringLiteral("Temple's engine workspace is unavailable.");
        const QString prepared = prepareSketch(m_root);
        if (!prepared.isEmpty()) return prepared;
        if (!writeBytes(m_root + "/TempleSeed/render-state.json", "{\"serve\":true}"))
            return QStringLiteral("Temple's persistent engine could not be prepared.");
        QFile::remove(m_root + "/TempleSeed/request.json");
        QFile::remove(m_root + "/TempleSeed/response.json");
        m_logPath = m_root + "/processing.log";
        m_desktopName = "AfterimageTemple-" + QUuid::createUuid().toString(QUuid::WithoutBraces);
        // P2D creates a Java surface. Its desktop is never switched into view.
        m_desktop = CreateDesktopW(reinterpret_cast<LPCWSTR>(m_desktopName.utf16()), nullptr, nullptr, 0,
            DESKTOP_CREATEWINDOW | DESKTOP_READOBJECTS | DESKTOP_WRITEOBJECTS, nullptr);
        if (!m_desktop) return QStringLiteral("The private Temple desktop could not be created (%1).").arg(GetLastError());
        m_log = CreateFileW(reinterpret_cast<LPCWSTR>(m_logPath.utf16()), GENERIC_WRITE,
            FILE_SHARE_READ, nullptr, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
        if (m_log == INVALID_HANDLE_VALUE) { m_log = nullptr; stop(); return QStringLiteral("Temple's engine log could not be opened."); }
        SetHandleInformation(m_log, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT);
        m_job = CreateJobObjectW(nullptr, nullptr);
        if (!m_job) { stop(); return QStringLiteral("Temple's owned process group could not be created."); }
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION limit{};
        limit.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        if (!SetInformationJobObject(m_job, JobObjectExtendedLimitInformation, &limit, sizeof(limit))) {
            stop(); return QStringLiteral("Temple's owned process group could not be configured.");
        }
        QStringList args{java, "--enable-native-access=ALL-UNNAMED",
            "-Dcompose.application.resources.dir=" + app + "/resources",
            "-Dcompose.application.configure.swing.globals=true", "-Dprocessing.version=4.5.6",
            "-Dprocessing.revision=1434", "-Dskiko.library.path=" + app,
            "-cp", app + "/*", "processing.app.ProcessingKt", "cli", "--sketch=" + m_root + "/TempleSeed", "--run"};
        QString command;
        for (const QString &arg : args) { if (!command.isEmpty()) command += ' '; command += quoted(arg); }
        std::wstring mutableCommand = command.toStdWString();
        std::wstring mutableDesktop = m_desktopName.toStdWString();
        STARTUPINFOW startup{};
        startup.cb = sizeof(startup);
        startup.lpDesktop = mutableDesktop.data();
        startup.dwFlags = STARTF_USESHOWWINDOW | STARTF_USESTDHANDLES;
        startup.wShowWindow = SW_HIDE;
        startup.hStdOutput = m_log; startup.hStdError = m_log; startup.hStdInput = m_log;
        const BOOL started = CreateProcessW(reinterpret_cast<LPCWSTR>(java.utf16()), mutableCommand.data(),
            nullptr, nullptr, TRUE, CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP | CREATE_SUSPENDED, nullptr,
            reinterpret_cast<LPCWSTR>(app.utf16()), &startup, &m_process);
        if (!started) { const DWORD code = GetLastError(); stop(); return QStringLiteral("Temple's private engine could not start (%1).").arg(code); }
        if (!AssignProcessToJobObject(m_job, m_process.hProcess)) {
            const DWORD code = GetLastError(); stop(); return QStringLiteral("Temple's renderer could not join its owned process group (%1).").arg(code);
        }
        ResumeThread(m_process.hThread);
        return {};
    }
    void stop() {
        if (m_job) { CloseHandle(m_job); m_job = nullptr; }
        if (m_process.hProcess) {
            CloseHandle(m_process.hThread); CloseHandle(m_process.hProcess); m_process = {};
        }
        if (m_log) { CloseHandle(m_log); m_log = nullptr; }
        if (m_desktop) { CloseDesktop(m_desktop); m_desktop = nullptr; }
    }
    std::mutex m_lock;
    QString m_root, m_logPath, m_desktopName;
    HDESK m_desktop = nullptr;
    HANDLE m_log = nullptr;
    HANDLE m_job = nullptr;
    PROCESS_INFORMATION m_process{};
};
QString runIsolated(const QString &root, const QJsonObject &request, int timeoutMs) {
    static PrivateRenderer renderer;
    return renderer.submit(root, request, timeoutMs);
}
#else
QString runIsolated(const QString &, const QJsonObject &, int) { return QStringLiteral("Temple rendering currently requires Windows."); }
#endif
struct RenderResult { QString path; QString error; QSize size; QJsonObject recipe; };
struct LoopResult { QString path; QString error; QSize size; int frames = 0; int fps = 0; };
RenderResult render(const QImage &source, const QJsonObject &authored, const QString &id, int maxEdge) {
    RenderResult result;
    if (source.isNull()) { result.error = QStringLiteral("The document snapshot is empty."); return result; }
    QJsonObject retained = TempleRecipe::retainMaterials(authored, &result.error);
    if (!result.error.isEmpty()) return result;
    result.recipe = retained;
    QImage input = source;
    if (maxEdge > 0 && qMax(source.width(), source.height()) > maxEdge)
        input = source.scaled(QSize(maxEdge, maxEdge), Qt::KeepAspectRatio, Qt::SmoothTransformation);
    result.size = input.size();
    const QString outputDir = workspace() + "/renders";
    if (!QDir().mkpath(outputDir)) { result.error = QStringLiteral("Temple's render folder is unavailable."); return result; }
    QTemporaryDir temp(workspace() + "/job-XXXXXX");
    if (!temp.isValid()) { result.error = QStringLiteral("Temple's private work folder is unavailable."); return result; }
    const QString tempPath = temp.path();
    const QString sourcePath = tempPath + "/source.png";
    if (!input.save(sourcePath, "PNG")) { result.error = QStringLiteral("The native snapshot could not be written."); return result; }
    result.path = outputDir + "/" + id + ".png";
    QJsonObject recipe = retained;
    recipe["sourceFit"] = recipe["sourceFit"].toString("contain");
    recipe["renderWidth"] = input.width();
    recipe["renderHeight"] = input.height();
    const QJsonObject state{{"requestId", id}, {"seed", recipe["seed"].toInt(886)}, {"parameters", QJsonObject{}},
        {"recipe", recipe}, {"width", input.width()}, {"height", input.height()}, {"frames", 1},
        {"paletteRepeats", 1}, {"outputDir", outputDir}, {"outputFile", result.path}, {"sourceImage", sourcePath}};
    result.error = runIsolated(engineRoot(), state, maxEdge > 0 ? 180000 : 900000);
    if (!result.error.isEmpty()) return result;
    if (!QFileInfo::exists(result.path) || QImageReader(result.path).size() != input.size()) {
        result.error = QStringLiteral("The Temple renderer did not return the requested image.");
        return result;
    }
    const QJsonObject metadata{{"engine", "Glitch Temple 0.47.3 / f4cde5d"}, {"recipe", retained},
        {"sourceWidth", source.width()}, {"sourceHeight", source.height()}, {"renderWidth", input.width()},
        {"renderHeight", input.height()}, {"renderId", id}};
    writeBytes(result.path + ".json", QJsonDocument(metadata).toJson(QJsonDocument::Indented));
    return result;
}

int paletteRepeats(const QJsonObject &recipe) {
    if (recipe["processStage"] == "form") return 1;
    int repeats = 1;
    for (const auto &value : recipe["effects"].toArray()) {
        const auto effect = value.toObject();
        const QString type = effect["type"].toString();
        if (!effect["enabled"].toBool(true) || (type != "palette-cycle" && type != "surface-motion")) continue;
        const int n = qRound(qBound(0.0, effect["parameters"].toObject()["speed"].toDouble(1), 4.0) * 8.0);
        repeats = qMax(repeats, n % 8 == 0 ? 1 : n % 4 == 0 ? 2 : n % 2 == 0 ? 4 : 8);
    }
    return repeats;
}
QString ffmpegPath() {
    const QString explicitPath = qEnvironmentVariable("AFTERIMAGE_TEMPLE_FFMPEG");
    return explicitPath.isEmpty() ? QCoreApplication::applicationDirPath() + "/ffmpeg/bin/ffmpeg.exe" : explicitPath;
}
QString runFfmpeg(const QString &binary, const QStringList &arguments, const QString &logPath) {
    QProcess process;
    process.setProgram(binary);
    process.setArguments(arguments);
    process.setStandardOutputFile(QProcess::nullDevice());
    process.setStandardErrorFile(logPath);
#ifdef Q_OS_WIN
    process.setCreateProcessArgumentsModifier([](QProcess::CreateProcessArguments *args) {
        args->flags |= CREATE_NO_WINDOW;
    });
#endif
    process.start();
    if (!process.waitForStarted(30000)) return QStringLiteral("FFmpeg could not start: %1").arg(process.errorString());
    if (!process.waitForFinished(900000)) {
        process.kill(); process.waitForFinished();
        return QStringLiteral("FFmpeg encoding timed out. See %1").arg(logPath);
    }
    if (process.exitStatus() != QProcess::NormalExit || process.exitCode() != 0)
        return QStringLiteral("FFmpeg could not encode this loop. See %1").arg(logPath);
    return {};
}
LoopResult renderLoop(const QImage &source, const QJsonObject &authored, const QString &id,
                      const QString &format, const QString &requestedPath) {
    LoopResult result;
    if (source.isNull()) { result.error = QStringLiteral("The document snapshot is empty."); return result; }
    const QJsonObject retained = TempleRecipe::retainMaterials(authored, &result.error);
    if (!result.error.isEmpty()) return result;
    const int width = qBound(64, retained["gifWidth"].toInt(source.width()), 3840);
    const int height = qBound(64, retained["gifHeight"].toInt(source.height()), 3840);
    result.size = QSize(format == "mp4" ? width + width % 2 : width,
                        format == "mp4" ? height + height % 2 : height);
    const int repeats = paletteRepeats(retained);
    result.frames = qBound(2, retained["loopFrames"].toInt(36), 240) * repeats;
    result.fps = qBound(1, retained["loopFps"].toInt(12), 30);
    result.path = requestedPath.isEmpty() ? workspace() + "/renders/" + id + "." + format : requestedPath;
    if (QFileInfo(result.path).suffix().compare(format, Qt::CaseInsensitive) != 0) {
        result.error = QStringLiteral("The output filename must end in .%1.").arg(format); return result;
    }
    if (!QFileInfo::exists(ffmpegPath())) {
        result.error = QStringLiteral("The app-owned FFmpeg runtime is missing at %1.").arg(ffmpegPath()); return result;
    }
    if (!QDir().mkpath(QFileInfo(result.path).absolutePath())) {
        result.error = QStringLiteral("The Temple loop destination is unavailable."); return result;
    }
    if (!QDir().mkpath(workspace() + QStringLiteral("/renders"))) {
        result.error = QStringLiteral("Temple's loop evidence folder is unavailable."); return result;
    }
    QTemporaryDir temp(workspace() + "/loop-XXXXXX");
    if (!temp.isValid()) { result.error = QStringLiteral("Temple's loop workspace is unavailable."); return result; }
    const QString sourcePath = temp.path() + "/source.png";
    if (!source.save(sourcePath, "PNG")) { result.error = QStringLiteral("The source snapshot could not be written."); return result; }
    const QString framesDir = temp.path() + "/frames";
    if (!QDir().mkpath(framesDir)) { result.error = QStringLiteral("The loop frame folder is unavailable."); return result; }
    QJsonObject recipe = retained;
    recipe["renderWidth"] = result.size.width(); recipe["renderHeight"] = result.size.height();
    const QString unusedOutput = framesDir + QStringLiteral("/unused.png");
    const QJsonObject state{{"requestId", id}, {"seed", recipe["seed"].toInt(886)}, {"parameters", QJsonObject{}},
        {"recipe", recipe}, {"width", result.size.width()}, {"height", result.size.height()},
        {"frames", result.frames}, {"paletteRepeats", repeats}, {"outputDir", framesDir},
        {"outputFile", unusedOutput}, {"sourceImage", sourcePath}};
    result.error = runIsolated(engineRoot(), state, qMax(900000, result.frames * 10000));
    if (!result.error.isEmpty()) return result;
    for (int i = 1; i <= result.frames; ++i) {
        if (!QFileInfo::exists(framesDir + QStringLiteral("/frame-%1.png").arg(i, 4, 10, QLatin1Char('0')))) {
            result.error = QStringLiteral("Temple did not render every loop frame (%1/%2).").arg(i).arg(result.frames); return result;
        }
    }
    const QString pattern = framesDir + "/frame-%04d.png";
    const QString fps = QString::number(result.fps);
    const QString encoded = temp.path() + "/encoded." + format;
    const QString log = workspace() + "/renders/" + id + ".ffmpeg.log";
    if (format == "gif") {
        const QString palette = framesDir + "/palette.png";
        result.error = runFfmpeg(ffmpegPath(), {"-y", "-framerate", fps, "-i", pattern,
            "-vf", "palettegen=stats_mode=diff", palette}, log);
        if (result.error.isEmpty()) result.error = runFfmpeg(ffmpegPath(), {"-y", "-framerate", fps,
            "-i", pattern, "-i", palette, "-lavfi", "paletteuse=dither=sierra2_4a", "-loop", "0", encoded}, log);
    } else {
        result.error = runFfmpeg(ffmpegPath(), {"-y", "-framerate", fps, "-i", pattern,
            "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
            "-movflags", "+faststart", encoded}, log);
    }
    if (!result.error.isEmpty()) return result;
    QFile input(encoded);
    QSaveFile output(result.path);
    if (!input.open(QIODevice::ReadOnly) || !output.open(QIODevice::WriteOnly)) {
        result.error = QStringLiteral("The encoded Temple loop could not be retained."); return result;
    }
    while (!input.atEnd()) {
        const QByteArray block = input.read(1024 * 1024);
        if (block.isEmpty() || output.write(block) != block.size()) {
            output.cancelWriting(); result.error = QStringLiteral("The encoded Temple loop could not be written."); return result;
        }
    }
    if (!output.commit()) { result.error = QStringLiteral("The encoded Temple loop could not be committed."); return result; }
    const QJsonObject metadata{{"engine", "Glitch Temple 0.47.3 / f4cde5d"}, {"recipe", retained},
        {"sourceWidth", source.width()}, {"sourceHeight", source.height()},
        {"width", result.size.width()}, {"height", result.size.height()},
        {"frames", result.frames}, {"fps", result.fps}, {"format", format}, {"exportId", id}};
    writeBytes(result.path + ".json", QJsonDocument(metadata).toJson(QJsonDocument::Indented));
    return result;
}
}

TempleService::TempleService(QObject *parent) : QObject(parent) { setObjectName(QStringLiteral("AfterimageTempleService")); }
TempleService *TempleService::instance() {
    static TempleService *service = new TempleService(QCoreApplication::instance());
    return service;
}
QString TempleService::documentId(KisDocument *document) {
    if (!document || !document->image()) return {};
    QString id = document->property("afterimageId").toString();
    if (id.isEmpty()) { id = QUuid::createUuid().toString(QUuid::WithoutBraces); document->setProperty("afterimageId", id); }
    return id;
}
KisDocument *TempleService::resolve(const QString &id) const {
    if (id.isEmpty()) return nullptr;
    for (const auto &document : KisPart::instance()->documents())
        if (document && document->property("afterimageId").toString() == id && document->image()) return document;
    return nullptr;
}
QString TempleService::renderRecipe(const QString &documentId, const QJsonObject &recipe, int maxEdge) {
    const QString requestId = QUuid::createUuid().toString(QUuid::WithoutBraces);
    QString error;
    if (!TempleRecipe::validate(recipe, &error)) {
        QTimer::singleShot(0, this, [this, requestId, error] { emit renderFinished(requestId, {{"error", error}}); });
        return requestId;
    }
    KisDocument *document = resolve(documentId);
    if (!document) {
        QTimer::singleShot(0, this, [this, requestId] {
            emit renderFinished(requestId, {{"error", "The named document is no longer open."}});
        });
        return requestId;
    }
    KisImageSP image = document->image();
    m_records.insert(requestId, {document, image, documentId, {}, image->size(), recipe, false});
    auto *timer = new QTimer(this);
    timer->setInterval(30);
    auto captureWait = std::make_shared<QElapsedTimer>();
    captureWait->start();
    connect(timer, &QTimer::timeout, this, [this, timer, requestId, image, recipe, maxEdge, captureWait]() mutable {
        const auto record = m_records.value(requestId);
        if (!record.document || record.document->image().data() != image.data()) {
            timer->stop(); timer->deleteLater(); m_records.remove(requestId);
            emit renderFinished(requestId, {{"error", "The named document was closed before capture."}}); return;
        }
        if (!image->tryBarrierLock(true)) {
            if (captureWait->elapsed() > 30000) {
                timer->stop(); timer->deleteLater(); m_records.remove(requestId);
                emit renderFinished(requestId, {{"error", "The document stayed busy; Temple could not capture it."}});
            }
            return;
        }
        timer->stop(); timer->deleteLater();
        KisPaintDeviceSP pixels = new KisPaintDevice(*image->projection());
        const QRect bounds = image->bounds();
        image->unlock();
        auto *watcher = new QFutureWatcher<RenderResult>(this);
        connect(watcher, &QFutureWatcher<RenderResult>::finished, this, [this, watcher, requestId] {
            const auto result = watcher->result(); watcher->deleteLater();
            auto found = m_records.find(requestId);
            if (found == m_records.end()) return;
            if (!result.error.isEmpty()) { m_records.erase(found); emit renderFinished(requestId, {{"error", result.error}}); return; }
            found->path = result.path; found->size = result.size; found->recipe = result.recipe; found->ready = true;
            emit renderFinished(requestId, renderInfo(requestId));
        });
        watcher->setFuture(QtConcurrent::run([pixels, bounds, recipe, requestId, maxEdge]() mutable {
            const QImage nativeSnapshot = maxEdge > 0 && qMax(bounds.width(), bounds.height()) > maxEdge
                ? pixels->createThumbnailUncached(maxEdge, maxEdge, bounds)
                : pixels->convertToQImage(nullptr, bounds);
            return render(nativeSnapshot, recipe, requestId, maxEdge);
        }));
    });
    timer->start();
    return requestId;
}
QString TempleService::exportLoop(const QString &documentId, const QJsonObject &recipe,
                                  const QString &format, const QString &outputPath) {
    const QString exportId = QUuid::createUuid().toString(QUuid::WithoutBraces);
    QString error;
    if (format != "gif" && format != "mp4") error = QStringLiteral("Choose GIF or MP4 for Temple loop export.");
    if (error.isEmpty()) TempleRecipe::validate(recipe, &error);
    KisDocument *document = error.isEmpty() ? resolve(documentId) : nullptr;
    if (error.isEmpty() && !document) error = QStringLiteral("The named document is no longer open.");
    if (!error.isEmpty()) {
        QTimer::singleShot(0, this, [this, exportId, error] { emit loopFinished(exportId, {{"error", error}}); });
        return exportId;
    }
    KisImageSP image = document->image();
    QPointer<KisDocument> owner(document);
    auto *timer = new QTimer(this);
    timer->setInterval(30);
    auto captureWait = std::make_shared<QElapsedTimer>(); captureWait->start();
    connect(timer, &QTimer::timeout, this,
        [this, timer, exportId, image, owner, recipe, format, outputPath, documentId, captureWait]() mutable {
            if (!owner || owner->image().data() != image.data()) {
                timer->stop(); timer->deleteLater();
                emit loopFinished(exportId, {{"error", "The named document closed before loop capture."}}); return;
            }
            if (!image->tryBarrierLock(true)) {
                if (captureWait->elapsed() > 30000) {
                    timer->stop(); timer->deleteLater();
                    emit loopFinished(exportId, {{"error", "The document stayed busy; Temple could not capture it."}});
                }
                return;
            }
            timer->stop(); timer->deleteLater();
            KisPaintDeviceSP pixels = new KisPaintDevice(*image->projection());
            const QRect bounds = image->bounds();
            image->unlock();
            auto *watcher = new QFutureWatcher<LoopResult>(this);
            connect(watcher, &QFutureWatcher<LoopResult>::finished, this, [this, watcher, exportId, documentId] {
                const LoopResult result = watcher->result(); watcher->deleteLater();
                QJsonObject response{{"exportId", exportId}, {"documentId", documentId},
                    {"path", result.path}, {"format", QFileInfo(result.path).suffix().toLower()},
                    {"width", result.size.width()}, {"height", result.size.height()},
                    {"frames", result.frames}, {"fps", result.fps}};
                if (!result.error.isEmpty()) response["error"] = result.error;
                emit loopFinished(exportId, response);
            });
            watcher->setFuture(QtConcurrent::run([pixels, bounds, recipe, exportId, format, outputPath]() mutable {
                const int edge = qBound(64, qMax(recipe["gifWidth"].toInt(960), recipe["gifHeight"].toInt(960)), 3840);
                const QImage snapshot = qMax(bounds.width(), bounds.height()) > edge
                    ? pixels->createThumbnailUncached(edge, edge, bounds)
                    : pixels->convertToQImage(nullptr, bounds);
                return renderLoop(snapshot, recipe, exportId, format, outputPath);
            }));
        });
    timer->start();
    return exportId;
}
QJsonObject TempleService::renderInfo(const QString &renderId) const {
    auto record = m_records.value(renderId);
    if (!record.ready) return {{"error", "This Temple render is not ready."}};
    const auto image = record.image.toStrongRef();
    return {{"renderId", renderId}, {"documentId", record.documentId}, {"path", record.path},
        {"width", record.size.width()}, {"height", record.size.height()}, {"fullSize", image && record.size == image->size()}};
}
QJsonObject TempleService::recipeForLayer(const QString &documentId, const QString &layerId) const {
    auto *document = resolve(documentId);
    if (!document) return {};
    const auto annotation = document->image()->annotation(QStringLiteral("afterimage-temple-recipes"));
    if (!annotation) return {};
    const QJsonObject stored = QJsonDocument::fromJson(annotation->annotation()).object()[layerId].toObject()["recipe"].toObject();
    bool missing = false;
    const QJsonObject restored = restoreMaterialValues(stored, document->image(), &missing).toObject();
    return missing ? QJsonObject{} : restored;
}
void TempleService::applyRender(const QString &renderId) {
    auto record = m_records.value(renderId);
    KisImageSP image = record.image.toStrongRef();
    if (!record.ready || !record.document || !image || record.document->image().data() != image.data()
        || record.size != image->size()) {
        emit applyFinished(renderId, {{"error", "Render a full-size image for its original open document before applying."}}); return;
    }
    auto *watcher = new QFutureWatcher<KisPaintDeviceSP>(this);
    connect(watcher, &QFutureWatcher<KisPaintDeviceSP>::finished, this, [this, watcher, renderId, record, image] {
        const auto pixels = watcher->result(); watcher->deleteLater();
        if (!pixels || !record.document || record.document->image().data() != image.data()) {
            emit applyFinished(renderId, {{"error", "The source document changed while Temple prepared the layer."}}); return;
        }
        auto *timer = new QTimer(this);
        timer->setInterval(30);
        connect(timer, &QTimer::timeout, this, [this, timer, record, image, renderId, pixels]() mutable {
            if (!record.document || record.document->image().data() != image.data()) {
                timer->stop(); timer->deleteLater(); emit applyFinished(renderId, {{"error", "The source document closed."}}); return;
            }
            if (!image->tryBarrierLock(true)) return;
            timer->stop(); timer->deleteLater();
            KisPaintLayerSP layer = new KisPaintLayer(image, QStringLiteral("Glitch Temple · %1").arg(renderId.left(8)), 255, pixels);
            KisNodeSP above = image->rootLayer()->lastChild();
            image->unlock();
            KisProcessingApplicator operation(image, KisNodeSP(), KisProcessingApplicator::NONE, {}, kundo2_i18n("Apply Glitch Temple render"));
            operation.applyCommand(new KisImageLayerAddCommand(image, layer, image->rootLayer(), above,
                KisImageLayerAddCommand::DoRedoUpdates | KisImageLayerAddCommand::DoUndoUpdates | KisImageLayerAddCommand::DontActivateOnAddition),
                KisStrokeJobData::BARRIER, KisStrokeJobData::EXCLUSIVE);
            auto completion = std::make_shared<std::future<bool>>(operation.successfullyCompletedFuture());
            operation.end();
            auto *finished = new QTimer(this);
            finished->setInterval(30);
            connect(finished, &QTimer::timeout, this, [this, finished, completion, record, image, renderId, layer]() mutable {
                if (completion->wait_for(std::chrono::seconds(0)) != std::future_status::ready) return;
                const bool ok = completion->get(); finished->stop(); finished->deleteLater();
                if (ok && record.document) {
                    const QString type = QStringLiteral("afterimage-temple-recipes");
                    const auto previous = image->annotation(type);
                    QJsonObject history = previous ? QJsonDocument::fromJson(previous->annotation()).object() : QJsonObject{};
                    const QJsonObject portableRecipe = embedMaterialValues(record.recipe, QString(), image).toObject();
                    history[layer->uuid().toString(QUuid::WithoutBraces)] = QJsonObject{
                        {"recipe", portableRecipe}, {"renderId", renderId},
                        {"sourceDocumentId", record.documentId}, {"engine", "Glitch Temple 0.47.3 / f4cde5d"}};
                    image->addAnnotation(new KisAnnotation(type, QStringLiteral("Editable Temple recipes by native layer ID"),
                        QJsonDocument(history).toJson(QJsonDocument::Compact)));
                }
                emit applyFinished(renderId, ok && record.document
                    ? QJsonObject{{"status", "applied"}, {"documentId", record.documentId}, {"layerId", layer->uuid().toString(QUuid::WithoutBraces)}}
                    : QJsonObject{{"error", "The native layer operation was cancelled."}});
            });
            finished->start();
        });
        timer->start();
    });
    watcher->setFuture(QtConcurrent::run([record, image] {
        const QImage raster(record.path);
        if (raster.isNull() || raster.size() != record.size) return KisPaintDeviceSP{};
        KisPaintDeviceSP pixels = new KisPaintDevice(image->colorSpace());
        pixels->convertFromQImage(raster, nullptr);
        return pixels;
    }));
}
