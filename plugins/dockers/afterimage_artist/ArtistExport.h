// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include <QtGlobal>
#if defined(AFTERIMAGE_ARTIST_CORE_BUILD)
#define AFTERIMAGE_ARTIST_EXPORT Q_DECL_EXPORT
#else
#define AFTERIMAGE_ARTIST_EXPORT Q_DECL_IMPORT
#endif
