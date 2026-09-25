// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include "TempleExport.h"
#include <QObject>
#include <QJsonArray>
#include <QJsonObject>
#include <functional>

class KisDocument;

// Bridge-neutral dynamic-tool seam. A conversation owns the bound document;
// every mutating request repeats its stable ID and can only act on that owner.
class AFTERIMAGE_TEMPLE_EXPORT TempleToolGateway : public QObject
{
    Q_OBJECT
public:
    using Reply = std::function<void(bool, const QJsonObject &)>;
    explicit TempleToolGateway(QObject *parent = nullptr) : QObject(parent) {}
    static QJsonArray tools();
    void invoke(KisDocument *boundDocument, const QString &tool, const QJsonObject &arguments, Reply reply);
};
