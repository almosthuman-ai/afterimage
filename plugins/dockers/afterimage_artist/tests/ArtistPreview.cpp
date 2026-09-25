// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#include "../PixelDock.h"
#include "../ComicDock.h"
#include <QApplication>
#include <QDir>
#include <QFont>
#include <QImage>
#include <QPainter>
#include <QStyleFactory>

template <typename Dock> bool capture(const QString &path, int width)
{
    Dock dock;
    dock.setAttribute(Qt::WA_DontShowOnScreen);
    dock.resize(width, 880);
    dock.ensurePolished();
    dock.show();
    QApplication::processEvents();
    QImage screenshot(dock.size() * dock.devicePixelRatioF(), QImage::Format_ARGB32_Premultiplied);
    screenshot.setDevicePixelRatio(dock.devicePixelRatioF());
    screenshot.fill(Qt::transparent);
    QPainter painter(&screenshot);
    dock.render(&painter);
    return screenshot.save(path);
}

int main(int argc, char **argv)
{
    QApplication app(argc, argv);
    app.setStyle(QStyleFactory::create("Fusion"));
    app.setFont(QFont("Segoe UI", 10));
    const QString output = argc > 1 ? QString::fromLocal8Bit(argv[1]) : QDir::currentPath();
    if (!QDir().mkpath(output)) return 1;
    for (int width : {360, 480}) {
        if (!capture<PixelDock>(QDir(output).filePath(QString("pixel-%1.png").arg(width)), width)) return 2;
        if (!capture<ComicDock>(QDir(output).filePath(QString("comic-%1.png").arg(width)), width)) return 3;
    }
    return 0;
}
