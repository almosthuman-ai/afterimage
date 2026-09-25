// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#include "../ArtistNative.h"
#include "../ComicProject.h"
#include <QDir>
#include <QFileInfo>
#include <QImage>
#include <QScopedPointer>
#include <QtMath>
#include <KisDocument.h>
#include <KisPart.h>
#include <KoColor.h>
#include <flake/kis_shape_layer.h>
#include <kis_config.h>
#include <kis_group_layer.h>
#include <kis_image.h>
#include <kis_paint_device.h>
#include <kis_paint_layer.h>
#include <kis_painter.h>
#include <testui.h>

namespace {
QByteArray headerSvg(int width, int height, const QStringList &titles)
{
    QString svg = QStringLiteral("<svg xmlns='http://www.w3.org/2000/svg' width='%1' height='%2' viewBox='0 0 %1 %2'>")
        .arg(width).arg(height);
    for (int index = 0; index < titles.size(); ++index) {
        const int origin = index * 512;
        svg += QStringLiteral("<rect x='%1' y='22' width='468' height='42' rx='3' fill='#fff8e9' opacity='.97'/>")
            .arg(origin + 22);
        svg += QStringLiteral("<text x='%1' y='53' font-family='Segoe UI' font-size='29' fill='#20343c'>%2</text>")
            .arg(origin + 48).arg(titles[index].toHtmlEscaped());
    }
    return (svg + QStringLiteral("</svg>")).toUtf8();
}

QVector<KisPaintLayerSP> paintLayersBottomFirst(KisImageSP image)
{
    QVector<KisPaintLayerSP> result;
    for (auto node = image->rootLayer()->firstChild(); node; node = node->nextSibling())
        if (auto *layer = dynamic_cast<KisPaintLayer *>(node.data())) result.append(layer);
    return result;
}
}

class RooftopBooklet : public QObject
{
    Q_OBJECT
private Q_SLOTS:
    void compose()
    {
        const QString sourcePath = qEnvironmentVariable("AFTERIMAGE_BOOKLET_SOURCE");
        const QString output = qEnvironmentVariable("AFTERIMAGE_BOOKLET_OUTPUT");
        QVERIFY2(!sourcePath.isEmpty() && QFileInfo(sourcePath).isFile(), "Set AFTERIMAGE_BOOKLET_SOURCE to the retained KRA.");
        QVERIFY2(!output.isEmpty() && QDir().mkpath(output), "Set AFTERIMAGE_BOOKLET_OUTPUT to a writable folder.");
        auto *part = KisPart::instance();
        ArtistNative native;
        QScopedPointer<KisDocument> strip(part->createDocument());
        strip->setFileBatchMode(true);
        QVERIFY(strip->loadNativeFormat(sourcePath));
        KisImageSP sourceImage = strip->image();
        QVERIFY(sourceImage);
        QCOMPARE(sourceImage->bounds().size(), QSize(1536, 864));
        KisShapeLayer *oldLettering = nullptr;
        for (auto node = sourceImage->rootLayer()->firstChild(); node; node = node->nextSibling())
            if (node->name() == QStringLiteral("Editable comic lettering"))
                oldLettering = dynamic_cast<KisShapeLayer *>(node.data());
        QVERIFY2(oldLettering, "The retained editable lettering layer is missing.");
        const QStringList titles{QStringLiteral("A little water"), QStringLiteral("A stubborn cloud"),
                                 QStringLiteral("Still growing")};
        bool finished = false, success = false;
        native.addVector(strip.data(), headerSvg(1536, 864, titles), QStringLiteral("Editable comic lettering"),
            QStringLiteral("Editable comic lettering"),
            [&](bool okay, const QString &) { success = okay; finished = true; });
        QTRY_VERIFY_WITH_TIMEOUT(finished, 30000);
        QVERIFY(success);
        sourceImage->initialRefreshGraph();
        sourceImage->waitForDone();
        const QDir stripFolder(QFileInfo(output).absolutePath());
        const QString correctedKra = stripFolder.filePath(QStringLiteral("rooftop-garden-corrected.kra"));
        QVERIFY(strip->exportDocumentSync(correctedKra, "application/x-krita"));
        const QString correctedPng = stripFolder.filePath(QStringLiteral("rooftop-garden-corrected.png"));
        finished = false;
        native.exportProjection(strip.data(), correctedPng, 1, false, false,
            [&](bool okay, const QString &) { success = okay; finished = true; });
        QTRY_VERIFY_WITH_TIMEOUT(finished, 30000);
        QVERIFY(success);
        QCOMPARE(QImage(correctedPng).size(), QSize(1536, 864));

        const QVector<KisPaintLayerSP> artLayers = paintLayersBottomFirst(sourceImage);
        QVERIFY2(!artLayers.isEmpty(), "The retained strip has no native art layers.");
        const QStringList filenames{QStringLiteral("01.kra"), QStringLiteral("02.kra"), QStringLiteral("03.kra")};
        for (int index = 0; index < 3; ++index) {
            const QRect crop(index * 512, 0, 512, 864);
            QScopedPointer<KisDocument> page(part->createDocument());
            page->setFileBatchMode(true);
            QVERIFY(page->newImage(titles[index], crop.width(), crop.height(), sourceImage->colorSpace(),
                KoColor(Qt::transparent, sourceImage->colorSpace()), KisConfig::CANVAS_COLOR, 1, "", 144.0 / 72.0));
            KisImageSP pageImage = page->image();
            QVERIFY(pageImage);
            auto initial = dynamic_cast<KisPaintLayer *>(pageImage->rootLayer()->firstChild().data());
            QVERIFY(initial);
            bool usedInitial = false;
            for (const KisPaintLayerSP &sourceLayer : artLayers) {
                if (!sourceLayer->visible() || !sourceLayer->paintDevice()->exactBounds().intersects(crop)) continue;
                KisPaintLayerSP destination;
                if (!usedInitial) { destination = initial; usedInitial = true; destination->setName(sourceLayer->name()); }
                else {
                    destination = new KisPaintLayer(pageImage, sourceLayer->name(), sourceLayer->opacity());
                    pageImage->addNode(destination, pageImage->rootLayer());
                }
                KisPainter painter(destination->paintDevice());
                painter.bitBlt(0, 0, sourceLayer->paintDevice(), crop.x(), crop.y(), crop.width(), crop.height());
                painter.end();
                destination->setDirty();
            }
            QVERIFY(usedInitial);
            pageImage->initialRefreshGraph();
            pageImage->waitForDone();
            finished = false;
            native.addVector(page.data(), headerSvg(512, 864, {titles[index]}),
                QStringLiteral("Lettering · %1").arg(titles[index]), {},
                [&](bool okay, const QString &) { success = okay; finished = true; });
            QTRY_VERIFY_WITH_TIMEOUT(finished, 30000);
            QVERIFY(success);
            pageImage->waitForDone();
            const QString kra = QDir(output).filePath(filenames[index]);
            finished = false;
            native.saveComicPage(page.data(), kra, output,
                [&](bool okay, const QString &) { success = okay; finished = true; });
            QTRY_VERIFY_WITH_TIMEOUT(finished, 60000);
            QVERIFY(success);
            const QString png = QDir(output).filePath(QStringLiteral("0%1.png").arg(index + 1));
            finished = false;
            native.exportProjection(page.data(), png, 1, false, false,
                [&](bool okay, const QString &) { success = okay; finished = true; });
            QTRY_VERIFY_WITH_TIMEOUT(finished, 30000);
            QVERIFY(success);
            const QImage renderedPage(png);
            QCOMPARE(renderedPage.size(), QSize(512, 864));
            const QImage originalSample = sourceImage->projection()->convertToQImage(nullptr,
                QRect(crop.x() + 200, 450, 1, 1));
            QCOMPARE(renderedPage.pixelColor(200, 450), originalSample.pixelColor(0, 0));
            QScopedPointer<KisDocument> reopened(part->createDocument());
            reopened->setFileBatchMode(true);
            QVERIFY(reopened->loadNativeFormat(kra));
            QVERIFY(reopened->image());
            QVERIFY(qAbs(reopened->image()->xRes() - 2.0) < 0.01);
            int vectorCount = 0, paintCount = 0;
            for (auto node = reopened->image()->rootLayer()->firstChild(); node; node = node->nextSibling()) {
                if (auto *vector = dynamic_cast<KisShapeLayer *>(node.data())) {
                    QVERIFY(!vector->shapes().isEmpty()); ++vectorCount;
                }
                if (dynamic_cast<KisPaintLayer *>(node.data())) ++paintCount;
            }
            QCOMPARE(vectorCount, 1);
            QVERIFY(paintCount >= 1);
        }
        QCOMPARE(ComicProject::pages(output), filenames);
        QStringList paths;
        for (const QString &filename : filenames) paths.append(QDir(output).filePath(filename));
        const QString pdf = QDir(output).filePath(QStringLiteral("Rooftop Garden Robot.pdf"));
        finished = false;
        native.exportComicPdf(paths, pdf, [&](bool okay, const QString &) { success = okay; finished = true; });
        QTRY_VERIFY_WITH_TIMEOUT(finished, 120000);
        QVERIFY(success);
        QVERIFY(QFileInfo(pdf).size() > 10000);
    }
};
KISTEST_MAIN(RooftopBooklet)
#include "RooftopBooklet.moc"
