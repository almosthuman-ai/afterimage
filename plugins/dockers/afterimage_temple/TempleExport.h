// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include <QtGlobal>

#if defined(AFTERIMAGE_TEMPLE_CORE_BUILD)
#define AFTERIMAGE_TEMPLE_EXPORT Q_DECL_EXPORT
#else
#define AFTERIMAGE_TEMPLE_EXPORT Q_DECL_IMPORT
#endif
