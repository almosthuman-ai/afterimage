// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include "TempleExport.h"
#include <QJsonArray>
#include <QJsonObject>
#include <QString>

namespace TempleRecipe {
AFTERIMAGE_TEMPLE_EXPORT QJsonObject catalog();
AFTERIMAGE_TEMPLE_EXPORT QJsonObject initial();
AFTERIMAGE_TEMPLE_EXPORT QJsonObject createEffect(const QString &type);
AFTERIMAGE_TEMPLE_EXPORT QJsonObject createForm(const QString &family);
AFTERIMAGE_TEMPLE_EXPORT bool validate(const QJsonObject &recipe, QString *error);
AFTERIMAGE_TEMPLE_EXPORT QString labelFor(const QString &type);
// Import file and data-URI materials into the app-owned binary vault. Returned
// recipes contain paths, never textual image payloads.
AFTERIMAGE_TEMPLE_EXPORT QJsonObject retainMaterials(const QJsonObject &recipe, QString *error);
}
