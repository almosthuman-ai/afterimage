// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include <QObject>
#include <QHash>
#include <QJsonObject>
#include <QPointer>
#include <QUrl>
#include <functional>

class KisDocument;
class QNetworkAccessManager;
class QNetworkReply;
class AfterimageImageStore;
class AfterimageDocumentBridge;

// Single-shot image producers share one retained-candidate contract. Neither
// provider owns or mutates a Krita document; native placement remains separate.
class AfterimageApiImages : public QObject
{
    Q_OBJECT
public:
    using Reply = std::function<void(bool, const QJsonObject &)>;
    explicit AfterimageApiImages(const QString &workspace, AfterimageImageStore *store, QObject *parent = nullptr);
    static QJsonObject catalog();
    static bool saveKey(const QString &provider, const QString &key, QString *error = nullptr);
    static bool forgetKey(const QString &provider, QString *error = nullptr);
    static bool hasKey(const QString &provider);
    static QString keyForProvider(const QString &provider);
    void setEphemeralKey(const QString &provider, const QString &key);
    void setEndpointForTesting(const QString &provider, const QUrl &endpoint);
    void start(KisDocument *document, const QJsonObject &request, Reply reply);
    void wait(const QString &jobId, Reply reply);
    void cancel(const QString &jobId, Reply reply);
Q_SIGNALS:
    void jobStarted(const QString &jobId);
    void jobReady(const QJsonObject &candidate);
    void jobFailed(const QString &jobId, const QString &message);
private:
    struct Job {
        QString id;
        QString state = "pending";
        QString error;
        QJsonObject candidate;
        QPointer<QNetworkReply> networkReply;
        QPointer<AfterimageDocumentBridge> capture;
        QList<Reply> waiters;
    };
    void submit(const QString &jobId, const QString &key, const QJsonObject &request, const QJsonObject &source);
    void fail(const QString &jobId, const QString &error);
    void retained(const QJsonObject &candidate);
    QString m_workspace;
    AfterimageImageStore *m_store;
    QNetworkAccessManager *m_network;
    QHash<QString, QString> m_ephemeralKeys;
    QHash<QString, QUrl> m_testEndpoints;
    QHash<QString, Job> m_jobs;
};
