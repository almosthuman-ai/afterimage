// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include <QJsonArray>
#include <QString>

// Adapted from Tai Mei's MIT-licensed Glitch Temple paletteScience.ts.
namespace TemplePalette {
QJsonArray generate(const QString &relationship, double hue, double chroma, double contrast, bool darkGround);
}
