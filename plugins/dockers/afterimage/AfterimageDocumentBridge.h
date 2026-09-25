// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include <QObject>
#include <QJsonObject>
#include <QJsonArray>
#include <functional>

class KisDocument;

class AfterimageDocumentBridge : public QObject
{
    Q_OBJECT
public:
    using Reply = std::function<void(bool, const QJsonArray &)>;
    explicit AfterimageDocumentBridge(const QString &artifactRoot, QObject *parent = nullptr) : QObject(parent), m_artifactRoot(artifactRoot) {}
    static QJsonArray tools();
    void invoke(KisDocument *document, const QString &tool, const QJsonObject &arguments, Reply reply);
    void cancelPending() { ++m_epoch; }
private:
    int m_epoch = 0;
    QString m_artifactRoot;
};
