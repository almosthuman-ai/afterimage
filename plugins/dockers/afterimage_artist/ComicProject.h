// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include "ArtistExport.h"
#include <QStringList>

// A comic is a folder of editable KRA pages. This small manifest owns order only.
class AFTERIMAGE_ARTIST_EXPORT ComicProject
{
public:
    static QStringList pages(const QString &folder);
    static bool saveOrder(const QString &folder, const QStringList &names, QString *error = nullptr);
    static bool appendPage(const QString &folder, const QString &fileName, QString *error = nullptr);
    static QString manifestName();
};
