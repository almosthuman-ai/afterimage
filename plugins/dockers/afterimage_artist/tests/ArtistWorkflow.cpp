// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#include "../ArtistNative.h"
#include "../ArtistToolGateway.h"
#include "../ComicProject.h"
#include <QFileInfo>
#include <QDir>
#include <QImage>
#include <QTemporaryDir>
#include <KisDocument.h>
#include <KisPart.h>
#include <KoColor.h>
#include <KoColorSpaceRegistry.h>
#include <flake/kis_shape_layer.h>
#include <kis_config.h>
#include <kis_group_layer.h>
#include <kis_image.h>
#include <kis_paint_device.h>
#include <kis_paint_layer.h>
#include <testui.h>

class ArtistWorkflow : public QObject
{
    Q_OBJECT
private Q_SLOTS:
    void transparentSpriteAndEditableComicPage()
    {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const QString output = qEnvironmentVariable("AFTERIMAGE_ARTIST_OUTPUT", dir.path());
        QVERIFY(QDir().mkpath(output));
        ArtistNative native;
        ArtistToolGateway gateway;
        auto *part = KisPart::instance();
        const auto *space = KoColorSpaceRegistry::instance()->rgb8();
        QScopedPointer<KisDocument> sprite(part->createDocument());
        sprite->setFileBatchMode(true);
        QVERIFY(sprite->newImage("Sprite", 24, 16, space, KoColor(Qt::transparent, space),
            KisConfig::CANVAS_COLOR, 1, "", 72));
        auto *spriteLayer = dynamic_cast<KisPaintLayer *>(sprite->image()->rootLayer()->firstChild().data());
        QVERIFY(spriteLayer);
        auto device = spriteLayer->paintDevice();
        device->fill(QRect(8, 6, 8, 7), KoColor(QColor("#468dab"), space));
        device->fill(QRect(9, 2, 6, 5), KoColor(QColor("#f2b76b"), space));
        device->fill(QRect(10, 4, 1, 1), KoColor(QColor("#202030"), space));
        device->fill(QRect(13, 4, 1, 1), KoColor(QColor("#202030"), space));
        device->fill(QRect(10, 13, 1, 2), KoColor(QColor("#202030"), space));
        device->fill(QRect(13, 13, 1, 2), KoColor(QColor("#202030"), space));
        spriteLayer->setDirty();
        sprite->image()->initialRefreshGraph();
        sprite->image()->waitForDone();
        QVERIFY2(device->convertToQImage(nullptr, QRect(9, 7, 1, 1)).pixelColor(0, 0).alpha() > 0,
            "Native sprite paint layer did not receive opaque pixels");
        QVERIFY2(sprite->image()->projection()->convertToQImage(nullptr, QRect(9, 7, 1, 1)).pixelColor(0, 0).alpha() > 0,
            "Native sprite projection did not paint the sprite");
        sprite->setProperty("afterimageId", "artist-sprite-test");
        const QString spriteOriginal = QDir(output).filePath("sprite-original.png");
        bool finished = false, success = false;
        gateway.invoke(sprite.data(), "afterimage_artist_palette_layer",
            {{"documentId", "artist-sprite-test"}, {"colors", QJsonArray{"#3d879d", "#f5ba70", "#202030"}}},
            [&](bool ok, const QJsonObject &) { success = ok; finished = true; });
        QTRY_VERIFY_WITH_TIMEOUT(finished, 30000);
        QVERIFY(success);
        sprite->image()->waitForDone();
        QVERIFY(!spriteLayer->visible());
        auto *paletteLayer = dynamic_cast<KisPaintLayer *>(sprite->image()->rootLayer()->lastChild().data());
        QVERIFY(paletteLayer);
        QVERIFY(paletteLayer->visible());
        finished = false;
        native.exportProjection(sprite.data(), spriteOriginal, 1, false, true, [&](bool ok, const QString &) {
            success = ok; finished = true;
        });
        QTRY_VERIFY_WITH_TIMEOUT(finished, 30000);
        QVERIFY(success);
        QCOMPARE(QImage(spriteOriginal).size(), QSize(24, 16));
        const QString spritePng = QDir(output).filePath("sprite-4x.png");
        finished = false;
        native.exportProjection(sprite.data(), spritePng, 4, false, true, [&](bool ok, const QString &) {
            success = ok; finished = true;
        });
        QTRY_VERIFY_WITH_TIMEOUT(finished, 30000);
        QVERIFY(success);
        QImage spriteImage(spritePng);
        QCOMPARE(spriteImage.size(), QSize(96, 64));
        QCOMPARE(spriteImage.format(), QImage::Format_Indexed8);
        QCOMPARE(spriteImage.pixelColor(8, 8).alpha(), 0);
        QCOMPARE(spriteImage.pixelColor(36, 28), QImage(spriteOriginal).pixelColor(9, 7));
        QVERIFY(spriteImage.pixelColor(36, 28).alpha() > 0);
        const QString spriteKra = QDir(output).filePath("sprite.kra");
        QVERIFY(sprite->exportDocumentSync(spriteKra, "application/x-krita"));
        QScopedPointer<KisDocument> spriteReopened(part->createDocument());
        spriteReopened->setFileBatchMode(true);
        QVERIFY(spriteReopened->loadNativeFormat(spriteKra));
        spriteReopened->image()->waitForDone();
        QCOMPARE(spriteReopened->image()->rootLayer()->childCount(), 2);
        QCOMPARE(spriteReopened->image()->projection()->convertToQImage(nullptr, spriteReopened->image()->bounds()).pixelColor(9, 7),
            QImage(spriteOriginal).pixelColor(9, 7));

        QScopedPointer<KisDocument> page(part->createDocument());
        page->setFileBatchMode(true);
        QVERIFY(page->newImage("Page", 300, 220, space, KoColor(Qt::white, space),
            KisConfig::RASTER_LAYER, 1, "", 300));
        page->image()->waitForDone();
        page->setProperty("afterimageId", "artist-page-test");
        finished = false;
        gateway.invoke(page.data(), "afterimage_artist_panels",
            {{"documentId", "artist-page-test"}, {"layout", "1x2"}, {"margin", 20}, {"gutter", 20}},
            [&](bool ok, const QJsonObject &) { success = ok; finished = true; });
        QTRY_VERIFY_WITH_TIMEOUT(finished, 30000);
        QVERIFY(success);
        page->image()->waitForDone();
        finished = false;
        gateway.invoke(page.data(), "afterimage_artist_lettering",
            {{"documentId", "artist-page-test"}, {"kind", "balloon"}, {"text", "Hello"},
             {"font", "Segoe UI"}, {"size", 18}, {"x", 48}, {"y", 45}},
            [&](bool ok, const QJsonObject &) { success = ok; finished = true; });
        QTRY_VERIFY_WITH_TIMEOUT(finished, 30000);
        QVERIFY(success);
        page->image()->waitForDone();
        const QString pagePng = QDir(output).filePath("page.png");
        finished = false;
        native.exportProjection(page.data(), pagePng, 1, false, false, [&](bool ok, const QString &) {
            success = ok; finished = true;
        });
        QTRY_VERIFY_WITH_TIMEOUT(finished, 30000);
        QVERIFY(success);
        const QImage result(pagePng);
        QCOMPARE(result.size(), QSize(300, 220));
        QVERIFY2(result.pixelColor(20, 100) != QColor(Qt::white), "Panel frame did not render into the export");
        QVERIFY2(result.pixelColor(48, 70) != QColor(Qt::white), "Editable balloon did not render into the export");
        const QString kra = QDir(output).filePath("page.kra");
        QVERIFY(page->exportDocumentSync(kra, "application/x-krita"));
        QScopedPointer<KisDocument> reopened(part->createDocument());
        reopened->setFileBatchMode(true);
        QVERIFY(reopened->loadNativeFormat(kra));
        reopened->image()->waitForDone();
        int vectors = 0;
        for (auto node = reopened->image()->rootLayer()->firstChild(); node; node = node->nextSibling())
            if (auto *layer = dynamic_cast<KisShapeLayer *>(node.data())) {
                QVERIFY(!layer->shapes().isEmpty());
                layer->forceUpdateHiddenAreaOnOriginal();
                ++vectors;
            }
        QCOMPARE(vectors, 2);
        reopened->image()->initialRefreshGraph();
        const QImage reopenedPixels = reopened->image()->projection()->convertToQImage(nullptr, reopened->image()->bounds());
        QVERIFY(reopenedPixels.pixelColor(20, 100) != QColor(Qt::white));
        QVERIFY(reopenedPixels.pixelColor(48, 70) != QColor(Qt::white));
        const QString pdf = QDir(output).filePath("page.pdf");
        finished = false;
        native.exportProjection(page.data(), pdf, 1, true, false, [&](bool ok, const QString &) {
            success = ok; finished = true;
        });
        QTRY_VERIFY_WITH_TIMEOUT(finished, 30000);
        QVERIFY(success);
        QVERIFY(QFileInfo(pdf).size() > 1000);

        const QString comicFolder = QDir(output).filePath("neutral-comic");
        QVERIFY(QDir().mkpath(comicFolder));
        const QStringList titles{"01 The signal", "02 The search", "03 The answer"};
        const QVector<QSize> sizes{QSize(300, 220), QSize(240, 320), QSize(300, 220)};
        const QStringList colors{"#467f9d", "#d77f66", "#5c9477"};
        for (int index = 0; index < titles.size(); ++index) {
            QScopedPointer<KisDocument> sheet(part->createDocument());
            sheet->setFileBatchMode(true);
            const QSize size = sizes[index];
            QVERIFY(sheet->newImage(titles[index], size.width(), size.height(), space, KoColor(Qt::white, space),
                KisConfig::RASTER_LAYER, 1, "", (index == 1 ? 150.0 : 300.0) / 72.0));
            sheet->image()->waitForDone();
            const QString art = QString("<svg xmlns='http://www.w3.org/2000/svg' width='%1' height='%2'>"
                "<circle cx='%3' cy='%4' r='33' fill='#f5cf73'/>"
                "<rect x='%5' y='%6' width='45' height='50' rx='7' fill='%7'/>"
                "<rect x='%8' y='%9' width='8' height='8' fill='#202030'/>"
                "<rect x='%10' y='%9' width='8' height='8' fill='#202030'/></svg>")
                .arg(size.width()).arg(size.height()).arg(size.width() - 65).arg(size.height() - 75)
                .arg(60 + index * 12).arg(size.height() / 2).arg(colors[index])
                .arg(68 + index * 12).arg(size.height() / 2 + 12).arg(86 + index * 12);
            finished = false;
            native.addVector(sheet.data(), art.toUtf8(), "Robot and light", {}, [&](bool ok, const QString &) {
                success = ok; finished = true;
            });
            QTRY_VERIFY_WITH_TIMEOUT(finished, 30000);
            QVERIFY(success);
            sheet->image()->waitForDone();
            const QByteArray frames = ArtistNative::panelSvg(size.width(), size.height(), index == 2 ? "1x1" : "1x2", 18, 12);
            finished = false;
            native.addVector(sheet.data(), frames, "Panels · Story", {}, [&](bool ok, const QString &) {
                success = ok; finished = true;
            });
            QTRY_VERIFY_WITH_TIMEOUT(finished, 30000);
            QVERIFY(success);
            sheet->setProperty("afterimageId", QString("neutral-page-%1").arg(index + 1));
            const QString words = index == 0 ? "A light appears." : index == 1 ? "The little robot follows it." : "Home at last.";
            finished = false;
            gateway.invoke(sheet.data(), "afterimage_artist_lettering",
                {{"documentId", sheet->property("afterimageId").toString()}, {"kind", index == 2 ? "balloon" : "caption"},
                 {"text", words}, {"font", "Segoe UI"}, {"size", 22},
                 {"region", QJsonObject{{"x", 28}, {"y", 28}, {"width", qMin(180, size.width() - 56)}, {"height", 72}}}},
                [&](bool ok, const QJsonObject &) { success = ok; finished = true; });
            QTRY_VERIFY_WITH_TIMEOUT(finished, 30000);
            QVERIFY(success);
            sheet->image()->waitForDone();
            const QString stem = QString("0%1").arg(index + 1);
            const QString kraPage = QDir(comicFolder).filePath(stem + ".kra");
            finished = false;
            native.saveComicPage(sheet.data(), kraPage, comicFolder, [&](bool ok, const QString &) {
                success = ok; finished = true;
            });
            QTRY_VERIFY_WITH_TIMEOUT(finished, 60000);
            QVERIFY(success);
            QCOMPARE(ComicProject::pages(comicFolder).size(), index + 1);
            const QString pngPage = QDir(comicFolder).filePath(stem + ".png");
            finished = false;
            native.exportProjection(sheet.data(), pngPage, 1, false, false, [&](bool ok, const QString &) {
                success = ok; finished = true;
            });
            QTRY_VERIFY_WITH_TIMEOUT(finished, 30000);
            QVERIFY(success);
            QCOMPARE(QImage(pngPage).size(), size);
            QScopedPointer<KisDocument> reopenedPage(part->createDocument());
            reopenedPage->setFileBatchMode(true);
            QVERIFY(reopenedPage->loadNativeFormat(kraPage));
            reopenedPage->image()->waitForDone();
            int editableVectors = 0;
            for (auto node = reopenedPage->image()->rootLayer()->firstChild(); node; node = node->nextSibling())
                if (auto *layer = dynamic_cast<KisShapeLayer *>(node.data())) {
                    QVERIFY(!layer->shapes().isEmpty()); ++editableVectors;
                }
            QCOMPARE(editableVectors, 3);
        }
        const QStringList reverseOrder{"03.kra", "02.kra", "01.kra"};
        QString orderError;
        QVERIFY2(ComicProject::saveOrder(comicFolder, reverseOrder, &orderError), qPrintable(orderError));
        QCOMPARE(ComicProject::pages(comicFolder), reverseOrder);
        const QStringList readingOrder{"01.kra", "02.kra", "03.kra"};
        QVERIFY2(ComicProject::saveOrder(comicFolder, readingOrder, &orderError), qPrintable(orderError));
        QCOMPARE(ComicProject::pages(comicFolder), readingOrder);
        const QString comicPdf = QDir(comicFolder).filePath("The little robot.pdf");
        finished = false;
        gateway.invoke(page.data(), "afterimage_artist_export_comic_pdf",
            {{"documentId", "artist-page-test"}, {"folder", comicFolder}, {"path", comicPdf}},
            [&](bool ok, const QJsonObject &) { success = ok; finished = true; });
        QTRY_VERIFY_WITH_TIMEOUT(finished, 60000);
        QVERIFY(success);
        QVERIFY(QFileInfo(comicPdf).size() > 3000);
    }
};
KISTEST_MAIN(ArtistWorkflow)
#include "ArtistWorkflow.moc"
