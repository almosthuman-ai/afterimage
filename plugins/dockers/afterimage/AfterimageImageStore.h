// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include <QObject>
#include <QJsonObject>

// All generators hand completed artifacts to the same store. No provider owns
// document pixels. Local model adapters can submit a file exactly like Codex.
class AfterimageImageStore : public QObject
{
    Q_OBJECT
public:
    explicit AfterimageImageStore(const QString &root, QObject *parent = nullptr);
    void retain(const QJsonObject &artifact, const QJsonObject &provenance);
    QString root() const { return m_root; }
Q_SIGNALS:
    void retained(const QJsonObject &candidate);
    void failed(const QString &message);
    void failedForItem(const QString &itemId, const QString &message);
private:
    QString m_root;
};
