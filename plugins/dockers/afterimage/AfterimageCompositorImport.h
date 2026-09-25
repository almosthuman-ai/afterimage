// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include <QObject>
#include <functional>
class KisDocument;

class AfterimageCompositorImport : public QObject
{
public:
    using Reply = std::function<void(KisDocument *, const QString &)>;
    using QObject::QObject;
    void load(const QString &path, Reply reply);
};
