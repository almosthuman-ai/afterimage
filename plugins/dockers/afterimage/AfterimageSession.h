// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once

#include <QObject>
#include <QProcess>
#include <QJsonObject>
#include <QJsonArray>
#include <QHash>
#include <functional>

// One app-server session per dock. The server owns durable threads and auth.
// The dock owns the selected thread and the document bound to its active turn.
class AfterimageSession : public QObject
{
    Q_OBJECT
public:
    using Reply = std::function<void(const QJsonObject &)>;
    explicit AfterimageSession(QObject *parent = nullptr);
    AfterimageSession(const QString &root, const QString &executable, QObject *parent = nullptr);
    ~AfterimageSession() override;
    void connectServer();
    void reconnectServer();
    void signIn();
    void signOut();
    void listThreads(const QString &cursor = {});
    void openThread(const QString &id);
    void loadEarlierMessages();
    void newThread();
    void send(const QString &text, const QJsonObject &context, const QJsonArray &tools);
    void interrupt();
    void answer(const QJsonValue &id, const QJsonObject &result);
    bool busy() const { return m_busy; }
    bool ready() const { return m_ready && (!m_signedIn || m_toolsReady); }
    QString threadId() const { return m_thread; }
    QString workspace() const { return m_work; }
    void setModel(const QString &model) { m_model = model; }

Q_SIGNALS:
    void status(const QString &text);
    void readinessChanged(bool ready, bool signedIn);
    void busyChanged(bool busy);
    void threadsReceived(const QJsonObject &result);
    void modelsReceived(const QJsonArray &models);
    void transcriptReceived(const QJsonObject &thread);
    void historyPageReceived(const QJsonArray &turns, bool prepend, const QString &nextCursor);
    void threadChanged(const QString &id);
    void eventReceived(const QString &method, const QJsonObject &params);
    void requestReceived(const QJsonValue &id, const QString &method, const QJsonObject &params);
    void failure(const QString &message);

private:
    struct Pending { QString method; Reply reply; };
    void rpc(const QString &method, const QJsonObject &params, Reply reply = {});
    void write(const QJsonObject &message);
    void readOutput();
    void readAccount();
    void prepareTools();
    void setBusy(bool busy);
    void disconnected();
    void startTurn(const QString &text, const QJsonObject &context);
    void readHistory(bool prepend);
    QProcess m_process;
    QHash<int, Pending> m_pending;
    QByteArray m_buffer;
    QString m_home, m_work, m_thread, m_turn, m_model, m_executable;
    QString m_historyCursor;
    int m_sequence = 0;
    bool m_ready = false, m_signedIn = false, m_busy = false, m_stopping = false;
    bool m_reconnecting = false, m_loginRequested = false;
    bool m_toolsReady = false, m_preparingTools = false;
};
