// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include "TempleExport.h"
#include <QObject>
#include <QHash>
#include <QJsonObject>
#include <QPointer>
#include <QSize>
#include <kis_image.h>

class KisDocument;

// App-owned, callable seam. All requests name a stable open document ID; no
// operation consults whichever tab, tool, or layer happens to be active later.
class AFTERIMAGE_TEMPLE_EXPORT TempleService : public QObject
{
    Q_OBJECT
public:
    static TempleService *instance();
    Q_INVOKABLE QString documentId(KisDocument *document);
    Q_INVOKABLE QString renderRecipe(const QString &documentId, const QJsonObject &recipe, int maxEdge,
                                    const QSize &targetSize = QSize());
    Q_INVOKABLE void applyRender(const QString &renderId);
    Q_INVOKABLE void cancelRequest(const QString &requestId);
    Q_INVOKABLE QString exportLoop(const QString &documentId, const QJsonObject &recipe,
                                  const QString &format, const QString &outputPath);
    Q_INVOKABLE QJsonObject renderInfo(const QString &renderId) const;
    Q_INVOKABLE QJsonObject recipeForLayer(const QString &documentId, const QString &layerId) const;
    Q_INVOKABLE QJsonObject draftForDocument(const QString &documentId) const;
    Q_INVOKABLE bool saveDraft(const QString &documentId, const QJsonObject &recipe);
Q_SIGNALS:
    void renderFinished(const QString &renderId, const QJsonObject &result);
    void applyFinished(const QString &renderId, const QJsonObject &result);
    void loopFinished(const QString &exportId, const QJsonObject &result);
private:
    explicit TempleService(QObject *parent = nullptr);
    struct Record {
        QPointer<KisDocument> document;
        KisImageWSP image;
        QString documentId;
        QString path;
        QSize size;
        QJsonObject recipe;
        bool ready = false;
    };
    QHash<QString, Record> m_records;
    KisDocument *resolve(const QString &id) const;
};
