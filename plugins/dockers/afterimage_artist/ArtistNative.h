// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include "ArtistExport.h"
#include <QObject>
#include <QPointer>
#include <QColor>
#include <QVector>
#include <QRect>
#include <QStringList>
#include <functional>

class KisDocument;
class KisMainWindow;
class QProcess;

// Krita remains the only document, pixel, layer, color and undo owner.
class AFTERIMAGE_ARTIST_EXPORT ArtistNative : public QObject
{
    Q_OBJECT
public:
    using Done = std::function<void(bool, const QString &)>;
    using Progress = std::function<void(int, int)>;
    explicit ArtistNative(QObject *parent = nullptr) : QObject(parent) {}
    static KisDocument *create(KisMainWindow *window, const QString &name, int width, int height, bool paper);
    void addVector(KisDocument *document, const QByteArray &svg, const QString &name,
        const QString &replacePrefix, Done done);
    void exportProjection(KisDocument *document, const QString &path, int scale, bool pdf, bool indexed, Done done);
    void exportComicPdf(const QStringList &kraPaths, const QString &path, Done done, Progress progress = {});
    void cancelComicPdf();
    static QString writeComicPdf(const QStringList &kraPaths, const QString &path, Progress progress = {});
    void saveComicPage(KisDocument *document, const QString &path, const QString &comicFolder, Done done);
    void paletteLayer(KisDocument *document, const QVector<QColor> &palette, bool dither, Done done);
    static QByteArray panelSvg(int width, int height, const QString &layout, int margin, int gutter);
    static QByteArray letteringSvg(int width, int height, const QString &text, const QString &font,
        int size, int x, int y, bool balloon);
    static QByteArray letteringSvg(int width, int height, const QString &text, const QString &font,
        int size, const QRect &region, bool balloon);
private:
    QPointer<QProcess> m_bookProcess;
};
