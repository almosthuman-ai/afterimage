// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include "ArtistExport.h"
#include <QObject>
#include <QJsonArray>
#include <QJsonObject>
#include <functional>
class KisDocument;

class AFTERIMAGE_ARTIST_EXPORT ArtistToolGateway : public QObject
{
    Q_OBJECT
public:
    using Reply = std::function<void(bool, const QJsonObject &)>;
    explicit ArtistToolGateway(QObject *parent = nullptr) : QObject(parent) {}
    static QJsonArray tools();
    void invoke(KisDocument *boundDocument, const QString &tool, const QJsonObject &arguments, Reply reply);
};
