// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include "TempleExport.h"
#include <QObject>
#include <QJsonObject>
#include <QJsonArray>
#include <QJsonValue>
#include <QPointer>
#include <functional>

class KisDocument;
#ifdef Q_OS_WIN
struct IStream;
#endif

// Adapts the original Studio's authoring commands to one bound native document
// and app-owned files. The web page never acquires an active-tab capability.
class AFTERIMAGE_TEMPLE_EXPORT TempleStudioBridge : public QObject
{
    Q_OBJECT
public:
    using Reply = std::function<void(bool, const QJsonValue &, const QString &)>;
    TempleStudioBridge(KisDocument *document, const QJsonObject &initialRecipe, QObject *parent = nullptr);
    void invoke(const QString &command, const QJsonObject &arguments, Reply reply);
    QString readableAsset(const QString &path) const;
#ifdef Q_OS_WIN
    QJsonObject importStream(IStream *stream, const QString &name, QString *error);
#endif
Q_SIGNALS:
    void recipeChanged(const QJsonObject &recipe);
private:
    QJsonObject snapshot() const;
    QJsonObject outputRecord(const QString &id, const QString &kind, const QJsonObject &result, const QJsonObject &recipe) const;
    void rememberOutput(const QJsonObject &output);
    QString workspace() const;
    QString documentId() const;
    QPointer<KisDocument> m_document;
    QJsonObject m_recipe;
    QJsonArray m_outputs;
    QString m_lastFullRender;
    QString m_activeRequestId;
    QStringList m_allowedGalleryAssets;
    bool m_rendering = false;
    bool m_importingEmoji = false;
};
