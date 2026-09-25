// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#include "AfterimageApiImages.h"
#include "AfterimageDocumentBridge.h"
#include "AfterimageImageStore.h"
#include <KisDocument.h>
#include <QFile>
#include <QFileInfo>
#include <QDir>
#include <QFutureWatcher>
#include <QHttpMultiPart>
#include <QJsonArray>
#include <QJsonDocument>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QSaveFile>
#include <QUuid>
#include <QtMath>
#include <QtConcurrentRun>
#ifdef Q_OS_WIN
#include <windows.h>
#include <wincred.h>
#endif

namespace {
QString credentialName(const QString &provider)
{
    if (provider == "openai") return QStringLiteral("Afterimage/API/OpenAI");
    if (provider == "gemini") return QStringLiteral("Afterimage/API/GoogleGemini");
    return {};
}
QString providerError(const QJsonObject &json, const QString &fallback)
{
    const QJsonValue value = json.value("error");
    const QString message = value.isObject() ? value.toObject().value("message").toString()
        : value.isString() ? value.toString() : QString();
    return (message.isEmpty() ? fallback : message).left(1000);
}
bool supported(const QString &provider, const QString &model)
{
    if (provider == "openai") return model == "gpt-image-2.5-sunburst" || model == "gpt-image-2.5-flare";
    if (provider == "gemini") return model == "gemini-3-pro-image" || model == "gemini-3.1-flash-image";
    return false;
}
QJsonObject decodeImageResponse(const QByteArray &body, const QString &provider, const QString &outputPath, int httpCode)
{
    QJsonParseError parseError;
    const QJsonObject json = QJsonDocument::fromJson(body, &parseError).object();
    if (parseError.error != QJsonParseError::NoError)
        return {{"error", QString("The provider returned unreadable JSON (HTTP %1).").arg(httpCode)}};
    if (httpCode < 200 || httpCode >= 300 || json.contains("error"))
        return {{"error", providerError(json, QString("The provider request failed (HTTP %1).").arg(httpCode))}};
    QByteArray encoded;
    if (provider == "openai") {
        const QJsonArray data = json.value("data").toArray();
        if (!data.isEmpty()) encoded = data.first().toObject().value("b64_json").toString().toUtf8();
    } else {
        for (const QJsonValue &candidate : json.value("candidates").toArray()) {
            for (const QJsonValue &part : candidate.toObject().value("content").toObject().value("parts").toArray()) {
                if (part.toObject().value("thought").toBool()) continue;
                const QJsonObject inlineData = part.toObject().value("inlineData").toObject();
                if (inlineData.value("mimeType").toString().startsWith("image/")) {
                    encoded = inlineData.value("data").toString().toUtf8();
                    break;
                }
            }
            if (!encoded.isEmpty()) break;
        }
    }
    if (encoded.isEmpty()) {
        QString reason;
        if (provider == "gemini") {
            const QJsonArray candidates = json.value("candidates").toArray();
            if (!candidates.isEmpty()) reason = candidates.first().toObject().value("finishReason").toString();
            if (reason.isEmpty()) reason = json.value("promptFeedback").toObject().value("blockReason").toString();
        }
        return {{"error", reason.isEmpty() ? "The provider returned no image." : QString("The provider returned no image: %1.").arg(reason.left(160))}};
    }
    const QByteArray bytes = QByteArray::fromBase64(encoded);
    if (bytes.isEmpty()) return {{"error", "The provider returned invalid image encoding."}};
    QSaveFile file(outputPath);
    if (!file.open(QIODevice::WriteOnly) || file.write(bytes) != bytes.size() || !file.commit())
        return {{"error", "The provider image could not be saved locally."}};
    QJsonObject result{{"savedPath", outputPath}};
    if (!json.value("model").toString().isEmpty()) result["reportedImageModel"] = json.value("model").toString().left(160);
    return result;
}
QString closestGeminiAspect(double ratio)
{
    const QList<QPair<QString, double>> ratios{{"1:1", 1.0}, {"2:3", 2.0 / 3.0}, {"3:2", 1.5},
        {"3:4", 0.75}, {"4:3", 4.0 / 3.0}, {"9:16", 9.0 / 16.0}, {"16:9", 16.0 / 9.0},
        {"9:21", 9.0 / 21.0}, {"21:9", 21.0 / 9.0}};
    QString chosen = "1:1";
    double distance = 100.0;
    for (const auto &entry : ratios) {
        const double next = qAbs(qLn(ratio / entry.second));
        if (next < distance) { distance = next; chosen = entry.first; }
    }
    return chosen;
}
QString openAiSize(double ratio)
{
    const double bounded = qBound(1.0 / 3.0, ratio, 3.0);
    const int edge = bounded >= 1.33 || bounded <= 0.75 ? 1536 : 1024;
    const int longEdge = bounded >= 1.0 ? edge : qRound(edge * bounded);
    const int shortEdge = bounded >= 1.0 ? qRound(edge / bounded) : edge;
    const auto multiple16 = [](int pixels) { return qMax(16, (pixels + 8) / 16 * 16); };
    return QString("%1x%2").arg(multiple16(longEdge)).arg(multiple16(shortEdge));
}
double requestedRatio(const QJsonObject &request, const QJsonObject &source)
{
    const QJsonArray rect = source.value("preparedSource").toObject().value("sourceRect").toArray();
    if (rect.size() == 4 && rect.at(2).toDouble() > 0 && rect.at(3).toDouble() > 0)
        return rect.at(2).toDouble() / rect.at(3).toDouble();
    const QString aspect = request.value("aspect").toString("1:1");
    const QStringList parts = aspect.split(':');
    return parts.size() == 2 && parts.at(1).toDouble() > 0
        ? parts.at(0).toDouble() / parts.at(1).toDouble() : 1.0;
}
}

AfterimageApiImages::AfterimageApiImages(const QString &workspace, AfterimageImageStore *store, QObject *parent)
    : QObject(parent), m_workspace(workspace), m_store(store), m_network(new QNetworkAccessManager(this))
{
    connect(store, &AfterimageImageStore::retained, this, &AfterimageApiImages::retained);
    connect(store, &AfterimageImageStore::failedForItem, this, [this](const QString &id, const QString &message) { fail(id, message); });
}

QJsonObject AfterimageApiImages::catalog()
{
    return {{"openai", QJsonArray{QJsonObject{{"id", "gpt-image-2.5-sunburst"}, {"label", "GPT Image 2.5 Sunburst"}, {"generation", true}, {"edit", true}, {"transparent", true}},
        QJsonObject{{"id", "gpt-image-2.5-flare"}, {"label", "GPT Image 2.5 Flare"}, {"generation", true}, {"edit", true}, {"transparent", true}}}},
        {"gemini", QJsonArray{QJsonObject{{"id", "gemini-3-pro-image"}, {"label", "Gemini 3 Pro Image"}, {"generation", true}, {"edit", true}, {"transparent", false}},
        QJsonObject{{"id", "gemini-3.1-flash-image"}, {"label", "Gemini 3.1 Flash Image"}, {"generation", true}, {"edit", true}, {"transparent", false}}}}};
}

bool AfterimageApiImages::saveKey(const QString &provider, const QString &key, QString *error)
{
    const QString name = credentialName(provider);
    if (name.isEmpty() || key.trimmed().isEmpty()) { if (error) *error = "Choose a provider and enter its API key."; return false; }
#ifdef Q_OS_WIN
    const QByteArray utf8 = key.trimmed().toUtf8();
    CREDENTIALW credential{};
    credential.Type = CRED_TYPE_GENERIC;
    credential.TargetName = const_cast<LPWSTR>(reinterpret_cast<LPCWSTR>(name.utf16()));
    credential.CredentialBlobSize = DWORD(utf8.size());
    credential.CredentialBlob = reinterpret_cast<LPBYTE>(const_cast<char *>(utf8.constData()));
    credential.Persist = CRED_PERSIST_LOCAL_MACHINE;
    credential.UserName = const_cast<LPWSTR>(L"Afterimage");
    if (CredWriteW(&credential, 0)) return true;
    if (error) *error = "Windows Credential Manager could not save the API key.";
#else
    if (error) *error = "Native credential storage is only available on Windows.";
#endif
    return false;
}

bool AfterimageApiImages::forgetKey(const QString &provider, QString *error)
{
    const QString name = credentialName(provider);
    if (name.isEmpty()) { if (error) *error = "Unknown provider."; return false; }
#ifdef Q_OS_WIN
    if (CredDeleteW(reinterpret_cast<LPCWSTR>(name.utf16()), CRED_TYPE_GENERIC, 0) || GetLastError() == ERROR_NOT_FOUND) return true;
    if (error) *error = "Windows Credential Manager could not remove the API key.";
#else
    if (error) *error = "Native credential storage is only available on Windows.";
#endif
    return false;
}

QString AfterimageApiImages::keyForProvider(const QString &provider)
{
#ifdef Q_OS_WIN
    const QString name = credentialName(provider);
    if (name.isEmpty()) return {};
    PCREDENTIALW credential = nullptr;
    if (!CredReadW(reinterpret_cast<LPCWSTR>(name.utf16()), CRED_TYPE_GENERIC, 0, &credential)) return {};
    const QString result = QString::fromUtf8(reinterpret_cast<const char *>(credential->CredentialBlob), int(credential->CredentialBlobSize));
    CredFree(credential);
    return result;
#else
    Q_UNUSED(provider);
    return {};
#endif
}

bool AfterimageApiImages::hasKey(const QString &provider) { return !keyForProvider(provider).isEmpty(); }
void AfterimageApiImages::setEphemeralKey(const QString &provider, const QString &key) { m_ephemeralKeys[provider] = key; }
void AfterimageApiImages::setEndpointForTesting(const QString &provider, const QUrl &endpoint)
{
    if (endpoint.host() == "127.0.0.1" || endpoint.host() == "localhost") m_testEndpoints[provider] = endpoint;
}

void AfterimageApiImages::start(KisDocument *document, const QJsonObject &request, Reply reply)
{
    const QString provider = request.value("provider").toString();
    const QString model = request.value("model").toString();
    const QString prompt = request.value("prompt").toString().trimmed();
    const QString scope = request.value("scope").toString("none");
    const QString intent = request.value("intent").toString("replacement");
    const QString aspect = request.value("aspect").toString("1:1");
    if (!supported(provider, model) || prompt.isEmpty() || (scope != "none" && scope != "selection" && scope != "canvas" && scope != "region")
        || (intent != "replacement" && intent != "addition")
        || !QStringList{"1:1", "2:3", "3:2", "16:9", "9:16"}.contains(aspect)) {
        reply(false, {{"error", "Choose a supported provider and image model, a prompt, source scope, and edit intent."}}); return;
    }
    if (scope != "none" && (!document || !document->image())) {
        reply(false, {{"error", "Open an artwork before requesting a selected-area or canvas edit."}}); return;
    }
    const QString key = m_ephemeralKeys.value(provider, keyForProvider(provider));
    if (key.isEmpty()) { reply(false, {{"error", "Save this provider's API key in Afterimage first."}}); return; }
    const QString id = QUuid::createUuid().toString(QUuid::WithoutBraces);
    Job job; job.id = id; m_jobs.insert(id, job);
    QJsonObject normalized = request;
    normalized["provider"] = provider; normalized["model"] = model; normalized["prompt"] = prompt;
    normalized["scope"] = scope; normalized["intent"] = intent;
    normalized["aspect"] = aspect;
    QJsonObject targetSource;
    if (document && document->image()) {
        targetSource = AfterimageDocumentBridge::documentSummary(document, 0, 1);
        targetSource.remove("layers"); targetSource.remove("history");
        if (scope == "none") {
            const int width = targetSource.value("width").toInt();
            const int height = targetSource.value("height").toInt();
            targetSource["preparedSource"] = QJsonObject{{"sourceRect", QJsonArray{0, 0, width, height}},
                {"canvasWidth", width}, {"canvasHeight", height}, {"placement", "sourceRect"}};
        }
    }
    reply(true, {{"jobId", id}, {"status", "pending"}, {"provider", provider}, {"imageModel", model}});
    Q_EMIT jobStarted(id);
    if (scope == "none") {
        submit(id, key, normalized, targetSource);
        return;
    }
    // Capture through the same native bridge used by subscription edits. A
    // short-lived bridge keeps this API job independent of an active chat/tab.
    auto *capture = new AfterimageDocumentBridge(m_workspace, this);
    m_jobs[id].capture = capture;
    QPointer<KisDocument> owner(document);
    capture->bindDocument(document);
    capture->invoke(document, "afterimage_prepare_edit", {{"scope", scope}, {"rect", request.value("rect")}},
        [this, capture, owner, id, key, normalized, targetSource](bool ok, const QJsonArray &content) {
            capture->deleteLater();
            if (!m_jobs.contains(id) || m_jobs[id].state != "pending") return;
            if (!ok || !owner || content.isEmpty()) {
                const QString error = content.isEmpty() ? "The source artwork could not be captured."
                    : QJsonDocument::fromJson(content.first().toObject().value("text").toString().toUtf8()).object().value("error").toString();
                fail(id, error);
                return;
            }
            const QJsonObject prepared = QJsonDocument::fromJson(content.first().toObject().value("text").toString().toUtf8()).object();
            QJsonObject source = targetSource;
            source["preparedSource"] = prepared;
            submit(id, key, normalized, source);
        });
}

void AfterimageApiImages::submit(const QString &jobId, const QString &key, const QJsonObject &request, const QJsonObject &source)
{
    const QString provider = request.value("provider").toString();
    const QString model = request.value("model").toString();
    const QString userPrompt = request.value("prompt").toString();
    const QString sourcePath = source.value("preparedSource").toObject().value("previewPath").toString();
    const double ratio = requestedRatio(request, source);
    const bool addition = request.value("intent").toString() == "addition";
    const QString prompt = userPrompt + (addition
        ? QStringLiteral("\nOutput only the added foreground artwork with a genuinely transparent background and alpha channel. Do not copy the source background into the output.")
        : sourcePath.isEmpty() ? QString() : QStringLiteral("\nKeep the supplied crop's framing and composition; change the requested area."));
    if (!sourcePath.isEmpty() && !QFileInfo::exists(sourcePath)) { fail(jobId, "The captured source file is unavailable."); return; }
    QNetworkRequest networkRequest;
    networkRequest.setTransferTimeout(180000);
    QNetworkReply *networkReply = nullptr;
    if (provider == "openai") {
        const QUrl endpoint = m_testEndpoints.value(provider,
            QUrl(sourcePath.isEmpty() ? "https://api.openai.com/v1/images/generations" : "https://api.openai.com/v1/images/edits"));
        networkRequest.setUrl(endpoint);
        networkRequest.setRawHeader("Authorization", QByteArray("Bearer ") + key.toUtf8());
        if (sourcePath.isEmpty()) {
            networkRequest.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
            QJsonObject payload{{"model", model}, {"prompt", prompt}, {"output_format", "png"},
                {"background", addition ? "transparent" : "auto"}, {"size", openAiSize(ratio)}};
            networkReply = m_network->post(networkRequest, QJsonDocument(payload).toJson(QJsonDocument::Compact));
        } else {
            auto *multipart = new QHttpMultiPart(QHttpMultiPart::FormDataType);
            const auto field = [multipart](const QByteArray &name, const QByteArray &value) {
                QHttpPart part;
                part.setHeader(QNetworkRequest::ContentDispositionHeader, QVariant("form-data; name=\"" + QString::fromUtf8(name) + "\""));
                part.setBody(value);
                multipart->append(part);
            };
            field("model", model.toUtf8()); field("prompt", prompt.toUtf8()); field("output_format", "png");
            field("background", addition ? "transparent" : "auto");
            field("size", openAiSize(ratio).toUtf8());
            QHttpPart image;
            image.setHeader(QNetworkRequest::ContentDispositionHeader, "form-data; name=\"image\"; filename=\"source.png\"");
            image.setHeader(QNetworkRequest::ContentTypeHeader, "image/png");
            auto *file = new QFile(sourcePath, multipart);
            if (!file->open(QIODevice::ReadOnly)) { delete multipart; fail(jobId, "The source PNG could not be opened."); return; }
            image.setBodyDevice(file); multipart->append(image);
            networkReply = m_network->post(networkRequest, multipart);
            multipart->setParent(networkReply);
        }
    } else {
        networkRequest.setUrl(m_testEndpoints.value(provider,
            QUrl(QString("https://generativelanguage.googleapis.com/v1/models/%1:generateContent").arg(model))));
        networkRequest.setRawHeader("x-goog-api-key", key.toUtf8());
        networkRequest.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
        QJsonArray parts{QJsonObject{{"text", prompt}}};
        if (!sourcePath.isEmpty()) {
            QFile file(sourcePath);
            if (!file.open(QIODevice::ReadOnly)) { fail(jobId, "The source PNG could not be opened."); return; }
            parts.append(QJsonObject{{"inlineData", QJsonObject{{"mimeType", "image/png"}, {"data", QString::fromLatin1(file.readAll().toBase64())}}}});
        }
        // The generateContent ImageConfig accepts literal ratios ("16:9").
        // responseFormat.image.aspectRatio is a different enum wire type.
        const QJsonObject payload{{"contents", QJsonArray{QJsonObject{{"parts", parts}}}},
            {"generationConfig", QJsonObject{{"responseModalities", QJsonArray{"IMAGE"}},
                {"imageConfig", QJsonObject{{"aspectRatio", closestGeminiAspect(ratio)}, {"imageSize", "2K"}}}}}};
        networkReply = m_network->post(networkRequest, QJsonDocument(payload).toJson(QJsonDocument::Compact));
    }
    const QJsonObject provenance{{"provider", provider == "openai" ? "openai-api" : "gemini-api"},
        {"imageModel", model}, {"requestedImageModel", model}, {"model", model}, {"itemId", jobId}, {"jobId", jobId},
        {"prompt", userPrompt.left(2000)}, {"source", source}, {"intent", request.value("intent")},
        {"requestedAspect", request.value("aspect").toString("1:1")}};
    m_jobs[jobId].networkReply = networkReply;
    connect(networkReply, &QNetworkReply::finished, this, [this, networkReply, jobId, provider, provenance] {
        if (!m_jobs.contains(jobId) || m_jobs[jobId].state != "pending") { networkReply->deleteLater(); return; }
        const int status = networkReply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
        const QByteArray body = networkReply->readAll();
        const QString networkError = networkReply->error() == QNetworkReply::NoError ? QString() : networkReply->errorString();
        networkReply->deleteLater();
        if (status == 0 && !networkError.isEmpty()) { fail(jobId, networkError.left(500)); return; }
        const QString folder = m_workspace + "/api-incoming";
        QDir().mkpath(folder);
        const QString outputPath = QString(folder + "/" + jobId + ".png");
        auto *watcher = new QFutureWatcher<QJsonObject>(this);
        connect(watcher, &QFutureWatcher<QJsonObject>::finished, this, [this, watcher, jobId, provenance] {
            const QJsonObject artifact = watcher->result();
            watcher->deleteLater();
            if (artifact.contains("error")) { fail(jobId, artifact.value("error").toString()); return; }
            QJsonObject metadata = provenance;
            if (artifact.contains("reportedImageModel")) metadata["reportedImageModel"] = artifact.value("reportedImageModel");
            m_store->retain(artifact, metadata);
        });
        watcher->setFuture(QtConcurrent::run(decodeImageResponse, body, provider, outputPath, status));
    });
}

void AfterimageApiImages::retained(const QJsonObject &candidate)
{
    const QString id = candidate.value("jobId").toString();
    if (!m_jobs.contains(id)) return;
    auto &job = m_jobs[id];
    job.state = "retained"; job.candidate = candidate;
    const QJsonObject result{{"jobId", id}, {"status", "retained"}, {"candidateId", candidate.value("id")},
        {"provider", candidate.value("provider")}, {"imageModel", candidate.value("imageModel")},
        {"width", candidate.value("width")}, {"height", candidate.value("height")},
        {"hasAlpha", candidate.value("hasAlpha")}, {"hasTransparency", candidate.value("hasTransparency")},
        {"meetsIntent", candidate.value("intent").toString() != "addition" || candidate.value("hasTransparency").toBool()}};
    for (const Reply &reply : job.waiters) reply(true, result);
    job.waiters.clear();
    Q_EMIT jobReady(candidate);
}

void AfterimageApiImages::fail(const QString &jobId, const QString &error)
{
    if (!m_jobs.contains(jobId)) return;
    auto &job = m_jobs[jobId];
    job.state = "failed"; job.error = error.left(1000);
    const QJsonObject result{{"jobId", jobId}, {"status", "failed"}, {"error", job.error}};
    for (const Reply &reply : job.waiters) reply(false, result);
    job.waiters.clear();
    Q_EMIT jobFailed(jobId, job.error);
}

void AfterimageApiImages::wait(const QString &jobId, Reply reply)
{
    const auto it = m_jobs.find(jobId);
    if (it == m_jobs.end()) { reply(false, {{"error", "Unknown image API job."}}); return; }
    if (it->state == "failed") reply(false, {{"jobId", jobId}, {"status", "failed"}, {"error", it->error}});
    else if (it->state == "retained") reply(true, {{"jobId", jobId}, {"status", "retained"},
        {"candidateId", it->candidate.value("id")}, {"imageModel", it->candidate.value("imageModel")},
        {"hasAlpha", it->candidate.value("hasAlpha")}, {"hasTransparency", it->candidate.value("hasTransparency")},
        {"meetsIntent", it->candidate.value("intent").toString() != "addition" || it->candidate.value("hasTransparency").toBool()}});
    else it->waiters.append(reply);
}

void AfterimageApiImages::cancel(const QString &jobId, Reply reply)
{
    auto it = m_jobs.find(jobId);
    if (it == m_jobs.end()) { reply(false, {{"error", "Unknown image API job."}}); return; }
    if (it->state != "pending") { reply(false, {{"error", "This image API job has already finished."}}); return; }
    QPointer<AfterimageDocumentBridge> capture = it->capture;
    QPointer<QNetworkReply> networkReply = it->networkReply;
    fail(jobId, "The image API job was cancelled.");
    if (capture) { capture->cancelPending(); capture->deleteLater(); }
    if (networkReply) networkReply->abort();
    reply(true, {{"jobId", jobId}, {"status", "cancelled"}});
}
