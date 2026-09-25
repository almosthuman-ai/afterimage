// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include <QObject>
#include <QJsonObject>
#include <QPointer>
#include <QHash>
#include <QSet>
#include <QJsonArray>
#include <functional>

class KisDocument;
class TempleToolGateway;
class ArtistToolGateway;
class AfterimageApiImages;

class AfterimageDocumentBridge : public QObject
{
    Q_OBJECT
public:
    using Reply = std::function<void(bool, const QJsonArray &)>;
    explicit AfterimageDocumentBridge(const QString &artifactRoot, QObject *parent = nullptr);
    static QJsonArray tools();
    static QJsonObject documentSummary(KisDocument *document, int offset = 0, int limit = 40, const QString &layerId = {});
    void bindDocument(KisDocument *document);
    KisDocument *boundDocument() const;
    void markCandidatePending(const QString &itemId);
    void markCandidateReady(const QJsonObject &candidate);
    void markCandidateFailed(const QString &itemId, const QString &error);
    void setApiImages(AfterimageApiImages *service) { m_apiImages = service; }
    void invoke(KisDocument *document, const QString &tool, const QJsonObject &arguments, Reply reply);
    void place(KisDocument *document, const QJsonObject &candidate, bool alignToSource, bool nearest, Reply reply);
    void cancelPending() { ++m_epoch; }
private:
    int m_epoch = 0;
    QString m_artifactRoot;
    TempleToolGateway *m_templeGateway = nullptr;
    ArtistToolGateway *m_artistGateway = nullptr;
    AfterimageApiImages *m_apiImages = nullptr;
    QPointer<KisDocument> m_boundDocument;
    QSet<QString> m_pendingCandidates;
    QSet<QString> m_recentCandidateIds;
    QHash<QString, QJsonObject> m_readyCandidates;
    QHash<QString, QString> m_failedCandidates;
    QHash<QString, QList<Reply>> m_candidateWaiters;
};
