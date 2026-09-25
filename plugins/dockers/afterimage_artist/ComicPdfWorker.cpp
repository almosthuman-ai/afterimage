// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#include "ArtistNative.h"
#include <KisApplication.h>
#include <QCoreApplication>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QFile>
#include <QFileInfo>
#include <cstdio>

// A separate, windowless Krita process owns every loaded KRA document on its
// main Qt thread. The artist's process only owns the QProcess and a progress UI.
int main(int argc, char **argv)
{
    KisApplication application(QStringLiteral("AfterimageComicPdfWorker-%1").arg(QCoreApplication::applicationPid()), argc, argv);
    application.setApplicationName(QStringLiteral("Afterimage Comic PDF Worker"));
    application.addResourceTypes();
    application.loadPlugins();
    if (!application.registerResources()) {
        std::fputs("The native art resources could not be loaded.\n", stderr);
        return 2;
    }
    QFile inputFile;
    if (!inputFile.open(stdin, QIODevice::ReadOnly)) {
        std::fputs("The comic export request could not be read.\n", stderr);
        return 2;
    }
    const QJsonDocument request = QJsonDocument::fromJson(inputFile.readAll());
    const QJsonObject object = request.object();
    const QString path = object.value(QStringLiteral("path")).toString();
    const QJsonArray input = object.value(QStringLiteral("pages")).toArray();
    QStringList pages;
    for (const QJsonValue &value : input) {
        const QString page = value.toString();
        if (!QFileInfo(page).isFile() || !page.endsWith(QLatin1String(".kra"), Qt::CaseInsensitive)) {
            std::fputs("A saved KRA page is missing.\n", stderr);
            return 2;
        }
        pages.append(page);
    }
    if (path.isEmpty() || pages.isEmpty()) {
        std::fputs("The comic export request has no output or pages.\n", stderr);
        return 2;
    }
    const QString error = ArtistNative::writeComicPdf(pages, path, [](int current, int total) {
        std::fprintf(stdout, "PAGE %d %d\n", current, total);
        std::fflush(stdout);
    });
    if (!error.isEmpty()) {
        const QByteArray bytes = error.toUtf8();
        std::fwrite(bytes.constData(), 1, size_t(bytes.size()), stderr);
        std::fputc('\n', stderr);
        return 1;
    }
    return 0;
}
