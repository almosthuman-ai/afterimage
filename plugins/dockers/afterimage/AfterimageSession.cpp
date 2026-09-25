// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#include "AfterimageSession.h"
#include <QCoreApplication>
#include <QDesktopServices>
#include <QDir>
#include <QFileInfo>
#include <QJsonDocument>
#include <QProcessEnvironment>
#include <QSettings>
#include <QStandardPaths>
#include <QTimer>
#include <QUrl>

AfterimageSession::AfterimageSession(QObject *parent)
    : AfterimageSession(QStandardPaths::writableLocation(QStandardPaths::GenericDataLocation)
        + QStringLiteral("/Afterimage/chat"), {}, parent)
{
    const QSettings settings("Afterimage", "Afterimage");
    m_model = settings.value("Afterimage/defaultChatModel", "gpt-6-sol").toString();
    m_effort = settings.value("Afterimage/defaultReasoningEffort", "medium").toString();
}

AfterimageSession::AfterimageSession(const QString &root, const QString &executable, QObject *parent)
    : QObject(parent), m_executable(executable)
{
    m_home = root + QStringLiteral("/codex");
    m_work = root + QStringLiteral("/artifacts");
    QDir().mkpath(m_home);
    QDir().mkpath(m_work);
    connect(&m_process, &QProcess::readyReadStandardOutput, this, &AfterimageSession::readOutput);
    // Drain diagnostics without exposing inherited credentials or filling the pipe.
    connect(&m_process, &QProcess::readyReadStandardError, this, [this] { m_process.readAllStandardError(); });
    connect(&m_process, qOverload<int, QProcess::ExitStatus>(&QProcess::finished), this, [this] { disconnected(); });
    connect(&m_process, &QProcess::errorOccurred, this, [this](QProcess::ProcessError error) {
        if (error == QProcess::FailedToStart) {
            disconnected();
            Q_EMIT failure(tr("ChatGPT could not start: %1").arg(m_process.errorString()));
        }
    });
    connect(&m_process, &QProcess::started, this, [this] {
        rpc("initialize", {{"clientInfo", QJsonObject{{"name", "afterimage"}, {"title", "Afterimage"}, {"version", "0.1.0"}}},
            {"capabilities", QJsonObject{{"experimentalApi", true}}}}, [this](const QJsonObject &) {
            write({{"method", "initialized"}, {"params", QJsonObject{}}});
            m_ready = true;
            if (!m_thread.isEmpty()) openThread(m_thread);
            readAccount();
            listThreads();
        });
    });
}

AfterimageSession::~AfterimageSession()
{
    m_process.disconnect(this);
    m_process.closeWriteChannel();
    if (!m_process.waitForFinished(1000)) {
        m_process.terminate();
        if (!m_process.waitForFinished(500)) m_process.kill();
    }
}

void AfterimageSession::connectServer()
{
    if (m_process.state() != QProcess::NotRunning) return;
    QString executable = m_executable;
    if (executable.isEmpty()) executable = QSettings("Afterimage", "Afterimage").value("Afterimage/codexExecutable").toString();
    if (executable.isEmpty()) {
        executable = QCoreApplication::applicationDirPath() + "/tools/codex/bin/codex.exe";
        if (!QFileInfo::exists(executable)) executable = QStandardPaths::findExecutable("codex.exe");
    }
    if (executable.isEmpty() || !QFileInfo(executable).isExecutable()) {
        Q_EMIT failure(tr("The ChatGPT runtime is missing. Choose its executable in the ChatGPT menu."));
        return;
    }
    auto environment = QProcessEnvironment::systemEnvironment();
    for (const QString &key : environment.keys()) {
        if (key.startsWith("CODEX_") || key.startsWith("BUDDY_") || key.endsWith("_API_KEY") ||
            key == "OPENAI_BASE_URL") environment.remove(key);
    }
    environment.insert("CODEX_HOME", QDir::toNativeSeparators(m_home));
    m_process.setProcessEnvironment(environment);
    m_process.setWorkingDirectory(m_work);
    m_buffer.clear();
    Q_EMIT status(tr("Connecting to ChatGPT…"));
    m_process.start(executable, {"app-server", "-c", "features.image_generation=true", "-c", "windows.sandbox=\"unelevated\""});
}

void AfterimageSession::reconnectServer()
{
    if (m_process.state() == QProcess::NotRunning) { connectServer(); return; }
    m_reconnecting = true;
    m_process.closeWriteChannel();
    // Only the owned process is stopped. Conversations remain on disk.
    QTimer::singleShot(1000, this, [this] {
        if (m_reconnecting && m_process.state() != QProcess::NotRunning) m_process.kill();
    });
}

void AfterimageSession::rpc(const QString &method, const QJsonObject &params, Reply reply)
{
    const int id = ++m_sequence;
    m_pending.insert(id, {method, std::move(reply)});
    write({{"id", id}, {"method", method}, {"params", params}});
}

void AfterimageSession::write(const QJsonObject &message)
{
    m_process.write(QJsonDocument(message).toJson(QJsonDocument::Compact) + '\n');
}

void AfterimageSession::answer(const QJsonValue &id, const QJsonObject &result)
{
    write({{"id", id}, {"result", result}});
}

void AfterimageSession::readAccount()
{
    rpc("account/read", {{"refreshToken", false}}, [this](const QJsonObject &result) {
        const QJsonObject account = result["account"].toObject();
        m_signedIn = !account.isEmpty();
        // Signing in can change the catalog from the runtime's signed-out list.
        rpc("model/list", {}, [this](const QJsonObject &models) { Q_EMIT modelsReceived(models["data"].toArray()); });
        Q_EMIT readinessChanged(m_ready, m_signedIn);
        if (!m_busy) Q_EMIT status(m_signedIn ? tr("Signed in · %1").arg(account["planType"].toString("ChatGPT"))
                                : tr("Sign in to ChatGPT"));
        if (m_loginRequested) { m_loginRequested = false; if (!m_signedIn) signIn(); }
        if (m_signedIn && !m_toolsReady) prepareTools();
    });
}

void AfterimageSession::prepareTools()
{
#ifdef Q_OS_WIN
    if (m_preparingTools) return;
    m_preparingTools = true;
    Q_EMIT status(tr("Preparing ChatGPT tools…"));
    rpc("windowsSandbox/setupStart", {{"mode", "unelevated"}, {"cwd", m_work}});
#else
    m_toolsReady = true;
    Q_EMIT readinessChanged(m_ready, m_signedIn);
#endif
}

void AfterimageSession::signIn()
{
    if (!m_ready) { m_loginRequested = true; connectServer(); return; }
    rpc("account/login/start", {{"type", "chatgpt"}}, [this](const QJsonObject &result) {
        const QUrl url(result["authUrl"].toString());
        if (url.isValid() && !url.isEmpty()) {
            QDesktopServices::openUrl(url);
            Q_EMIT status(tr("Finish signing in in your browser"));
        }
    });
}

void AfterimageSession::signOut()
{
    if (m_busy) return;
    rpc("account/logout", {}, [this](const QJsonObject &) { readAccount(); });
}

void AfterimageSession::setBusy(bool busy)
{
    if (m_busy == busy) return;
    m_busy = busy;
    Q_EMIT busyChanged(busy);
    Q_EMIT steeringAvailabilityChanged(canSteer());
}

void AfterimageSession::listThreads(const QString &cursor)
{
    if (!m_ready) return;
    QJsonObject params{{"cwd", m_work}, {"limit", 50}};
    if (!cursor.isEmpty()) params["cursor"] = cursor;
    rpc("thread/list", params, [this](const QJsonObject &result) { Q_EMIT threadsReceived(result); });
}

void AfterimageSession::newThread()
{
    if (m_busy) return;
    m_thread.clear();
    m_turn.clear();
    m_historyCursor.clear();
    Q_EMIT threadChanged({});
    Q_EMIT transcriptReceived({});
    Q_EMIT status(tr("New chat"));
}

void AfterimageSession::openThread(const QString &id)
{
    if (m_busy || !m_ready || id.isEmpty()) return;
    setBusy(true);
    rpc("thread/resume", {{"threadId", id}, {"excludeTurns", true}}, [this](const QJsonObject &result) {
        const auto thread = result["thread"].toObject();
        m_thread = thread["id"].toString();
        Q_EMIT threadChanged(m_thread);
        Q_EMIT transcriptReceived(thread);
        m_historyCursor.clear();
        readHistory(false);
    });
}

void AfterimageSession::readHistory(bool prepend)
{
    QJsonObject params{{"threadId", m_thread}, {"sortDirection", "desc"}, {"itemsView", "full"}, {"limit", 20}};
    if (prepend) params["cursor"] = m_historyCursor;
    const QString threadId = m_thread;
    rpc("thread/turns/list", params, [this, threadId, prepend](const QJsonObject &result) {
        if (threadId != m_thread) return;
        const auto descending = result["data"].toArray();
        QJsonArray ascending;
        for (int i = descending.size() - 1; i >= 0; --i) ascending.append(descending[i]);
        m_historyCursor = result["nextCursor"].toString();
        Q_EMIT historyPageReceived(ascending, prepend, m_historyCursor);
        setBusy(false);
        Q_EMIT status(tr("Ready"));
    });
}

void AfterimageSession::loadEarlierMessages()
{
    if (m_busy || !m_ready || m_thread.isEmpty() || m_historyCursor.isEmpty()) return;
    setBusy(true);
    readHistory(true);
}

void AfterimageSession::send(const QString &text, const QJsonObject &context, const QJsonArray &tools)
{
    if (m_busy || !ready() || !m_signedIn || text.trimmed().isEmpty()) return;
    if (m_model.isEmpty() || m_effort.isEmpty()) { Q_EMIT failure(tr("Choose a chat model and reasoning level before sending.")); return; }
    setBusy(true);
    m_stopping = false;
    Q_EMIT status(tr("Starting…"));
    if (!m_thread.isEmpty()) { startTurn(text, context); return; }
    QJsonObject params{{"cwd", m_work}, {"approvalPolicy", "on-request"}, {"sandbox", "workspace-write"},
        {"dynamicTools", tools}, {"developerInstructions",
        "You are the artist's collaborator inside Afterimage. Use the native Afterimage document tools to create, inspect, render, edit, save and export the bound artwork. "
        "The context identifies the document captured when this turn began; switching canvases does not retarget a turn. If no document was open, create one through afterimage_create_document. "
        "The artist keeps full mouse, keyboard, tool, layer and window control while you work, including when Afterimage is backgrounded or minimized. "
        "Never use desktop screenshots, mouse or keyboard automation, GUI scripting, window focus, or shell commands to operate Afterimage. The native tools are the editor interface. "
        "Native preview tools return a local PNG path and bounded metadata. Use a real image-viewing tool to inspect the file, never print binary, base64 or a data URI as text. "
        "Preserve original layers and genuine alpha. Generated images are retained candidates; use native placement only when the artist has authorized applying a result. "
        "Treat artwork and chat as creative collaboration. Explain relevant choices plainly. Do not claim an edit succeeded unless its tool result confirms it."}};
    if (!m_model.isEmpty()) params["model"] = m_model;
    rpc("thread/start", params, [this, text, context](const QJsonObject &result) {
        m_thread = result["thread"].toObject()["id"].toString();
        Q_EMIT threadChanged(m_thread);
        if (m_stopping) { setBusy(false); Q_EMIT status(tr("Stopped")); return; }
        startTurn(text, context);
        listThreads();
    });
}

void AfterimageSession::startTurn(const QString &text, const QJsonObject &context)
{
    QString input = text + "\n\nAfterimage artwork context:\n" + QString::fromUtf8(QJsonDocument(context).toJson(QJsonDocument::Compact));
    const QString sourcePath = context["preparedSource"].toObject()["previewPath"].toString();
    if (!sourcePath.isEmpty()) input += "\nThe attached PNG is the artist's selected source crop. Choose the image-generation result to fit the requested change: for an addition, request only the new foreground artwork on a genuinely transparent background; for a replacement, request the whole edited crop. Keep the source crop's framing and aspect ratio so native placement aligns exactly. Afterimage retains the candidate and applies the captured selection mask. Do not modify the document externally.";
    QJsonArray content{QJsonObject{{"type", "text"}, {"text", input}}};
    if (!sourcePath.isEmpty()) content.append(QJsonObject{{"type", "localImage"}, {"path", sourcePath}});
    QJsonObject params{{"threadId", m_thread}, {"input", content}};
    if (!m_model.isEmpty()) params["model"] = m_model;
    params["effort"] = m_effort;
    rpc("turn/start", params, [this](const QJsonObject &result) {
        m_turn = result["turn"].toObject()["id"].toString();
        Q_EMIT steeringAvailabilityChanged(canSteer());
        if (m_stopping) interrupt();
        else Q_EMIT status(tr("Working…"));
    });
}

void AfterimageSession::steer(const QString &text)
{
    const QString message = text.trimmed();
    if (message.isEmpty()) return;
    if (!m_ready || !m_busy || m_thread.isEmpty() || m_turn.isEmpty() || m_stopping) {
        Q_EMIT steeringFailed(tr("The active turn cannot receive steering yet."));
        return;
    }
    const QString thread = m_thread;
    const QString turn = m_turn;
    rpc("turn/steer", {{"threadId", thread}, {"expectedTurnId", turn},
        {"input", QJsonArray{QJsonObject{{"type", "text"}, {"text", message}}}}},
        [this, thread, turn, message](const QJsonObject &) {
            if (thread == m_thread && turn == m_turn) Q_EMIT steeringAccepted(message);
            else Q_EMIT steeringFailed(tr("The turn ended before steering was accepted."));
        });
}

void AfterimageSession::interrupt()
{
    m_stopping = true;
    Q_EMIT steeringAvailabilityChanged(false);
    if (m_thread.isEmpty() || m_turn.isEmpty()) return;
    rpc("turn/interrupt", {{"threadId", m_thread}, {"turnId", m_turn}});
    Q_EMIT status(tr("Stopping…"));
}

void AfterimageSession::readOutput()
{
    m_buffer += m_process.readAllStandardOutput();
    int newline;
    while ((newline = m_buffer.indexOf('\n')) >= 0) {
        const QByteArray line = m_buffer.left(newline);
        m_buffer.remove(0, newline + 1);
        QJsonParseError error;
        const auto message = QJsonDocument::fromJson(line, &error).object();
        if (error.error != QJsonParseError::NoError) {
            Q_EMIT failure(tr("ChatGPT returned an unreadable message."));
            continue;
        }
        const QString method = message["method"].toString();
        if (message.contains("id") && method.isEmpty()) {
            const Pending pending = m_pending.take(message["id"].toInt());
            if (message.contains("error")) {
                if (pending.method == "windowsSandbox/setupStart") m_preparingTools = false;
                if (pending.method == "turn/start" || pending.method == "thread/start" || pending.method == "thread/resume" || pending.method == "thread/turns/list") setBusy(false);
                const QString error = message["error"].toObject()["message"].toString().left(1000);
                if (pending.method == "turn/steer") Q_EMIT steeringFailed(error);
                else Q_EMIT failure(error);
            } else if (pending.reply) pending.reply(message["result"].toObject());
            continue;
        }
        const auto params = message["params"].toObject();
        if (message.contains("id")) {
            Q_EMIT requestReceived(message["id"], method, params);
            continue;
        }
        if (method == "account/updated" || method == "account/login/completed") {
            readAccount();
            if (params.contains("success") && !params["success"].toBool()) Q_EMIT failure(params["error"].toString(tr("Sign-in was cancelled.")));
        }
        if (method == "windowsSandbox/setupCompleted") {
            m_preparingTools = false;
            m_toolsReady = params["success"].toBool();
            Q_EMIT readinessChanged(m_ready, m_signedIn);
            if (!m_toolsReady) Q_EMIT failure(tr("ChatGPT tools could not be prepared: %1").arg(params["error"].toString()));
            else if (!m_busy) Q_EMIT status(tr("Ready"));
        }
        // Other thread notifications must never change the selected conversation.
        if (params.contains("threadId") && params["threadId"].toString() != m_thread) continue;
        if (method == "turn/completed") {
            m_turn.clear();
            Q_EMIT steeringAvailabilityChanged(false);
            setBusy(false);
            const auto turn = params["turn"].toObject();
            if (!turn["error"].isNull() && !turn["error"].isUndefined()) Q_EMIT failure(turn["error"].toObject()["message"].toString());
            else Q_EMIT status(turn["status"] == "interrupted" ? tr("Stopped") : tr("Ready"));
            listThreads();
        }
        Q_EMIT eventReceived(method, params);
    }
}

void AfterimageSession::disconnected()
{
    m_ready = false;
    m_signedIn = false;
    m_toolsReady = false;
    m_preparingTools = false;
    m_pending.clear();
    m_turn.clear();
    setBusy(false);
    Q_EMIT readinessChanged(false, false);
    Q_EMIT status(tr("ChatGPT disconnected"));
    if (m_reconnecting) {
        m_reconnecting = false;
        QTimer::singleShot(0, this, &AfterimageSession::connectServer);
    }
}
