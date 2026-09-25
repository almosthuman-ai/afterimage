// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#include "../AfterimageDocumentBridge.h"
#include "../AfterimageImageStore.h"
#include "../AfterimageCompositorImport.h"
#include <QJsonDocument>
#include <QSignalSpy>
#include <QTemporaryDir>
#include <KisDocument.h>
#include <KisPart.h>
#include <KoColor.h>
#include <KoColorSpaceRegistry.h>
#include <kis_group_layer.h>
#include <kis_image.h>
#include <kis_paint_layer.h>
#include <kis_paint_device.h>
#include <kis_selection.h>
#include <kis_selection_mask.h>
#include <kis_pixel_selection.h>
#include <flake/kis_shape_layer.h>
#include <kundo2stack.h>
#include <testui.h>

class WorkflowTest : public QObject
{
    Q_OBJECT
private Q_SLOTS:
    void blankNativeAgentWorkflow()
    {
        QTemporaryDir directory;
        QVERIFY(directory.isValid());
        AfterimageDocumentBridge bridge(directory.path());
        bridge.bindDocument(nullptr);
        bool done = false;
        bool success = false;
        QJsonObject result;
        const auto call = [&](const QString &tool, const QJsonObject &arguments) {
            done = false;
            bridge.invoke(nullptr, tool, arguments, [&](bool ok, const QJsonArray &content) {
                success = ok;
                result = QJsonDocument::fromJson(content.first().toObject()["text"].toString().toUtf8()).object();
                done = true;
            });
            QTRY_VERIFY_WITH_TIMEOUT(done, 30000);
            QVERIFY2(success, qPrintable(QString::fromUtf8(QJsonDocument(result).toJson())));
        };
        call("afterimage_create_document", {{"title", "Night garden"}, {"width", 320}, {"height", 240}, {"background", "#fff6e8"}});
        KisDocument *document = bridge.boundDocument();
        QVERIFY(document);
        QCOMPARE(result["width"].toInt(), 320);
        const QString svg = "<svg xmlns='http://www.w3.org/2000/svg' width='320' height='240'>"
            "<rect x='20' y='20' width='280' height='200' fill='#142544'/>"
            "<circle cx='160' cy='120' r='45' fill='#f1d36b'/>"
            "<text x='30' y='205' fill='white' font-size='26'>Night garden</text></svg>";
        call("afterimage_svg_layer", {{"name", "Moon and lettering"}, {"svg", svg}});
        const QString firstId = result["layerId"].toString();
        QVERIFY(!firstId.isEmpty());
        call("afterimage_document", {{"limit", 1}});
        QCOMPARE(result["layers"].toArray().size(), 1);
        QVERIFY(result["nextLayerOffset"].toInt() > 0);
        call("afterimage_document", {{"layerId", firstId}});
        QCOMPARE(result["layer"].toObject()["id"].toString(), firstId);
        call("afterimage_preview", {{"scope", "canvas"}, {"maxEdge", 320}});
        QVERIFY(QFileInfo::exists(result["previewPath"].toString()));
        QVERIFY(!result.contains("inputImage"));
        QVERIFY(!result.contains("dataUri"));
        const QImage firstPreview(result["previewPath"].toString());
        QVERIFY(!firstPreview.isNull());
        QVERIFY2(firstPreview.pixelColor(160, 120) != QColor("#fff6e8"),
            qPrintable(QStringLiteral("Native vector geometry did not render; center pixel is %1")
                .arg(firstPreview.pixelColor(160, 120).name())));
        call("afterimage_preview", {{"scope", "canvas"}, {"maxEdge", 160}});
        QCOMPARE(QImage(result["previewPath"].toString()).size(), QSize(160, 120));
        call("afterimage_prepare_edit", {{"scope", "region"}, {"rect", QJsonObject{{"x", 12},
            {"y", 20}, {"width", 120}, {"height", 80}}}});
        QCOMPARE(result["sourceRect"].toArray(), QJsonArray({12, 20, 120, 80}));
        QCOMPARE(QImage(result["previewPath"].toString()).size(), QSize(120, 80));
        QVERIFY(result["maskPath"].toString().isEmpty());
        QVERIFY(!document->image()->globalSelection());
        const QString revised = "<svg xmlns='http://www.w3.org/2000/svg' width='320' height='240'>"
            "<rect x='20' y='20' width='280' height='200' fill='#35406a'/>"
            "<circle cx='180' cy='110' r='45' fill='#f1d36b'/></svg>";
        call("afterimage_svg_layer", {{"name", "Moved moon"}, {"svg", revised}, {"layerId", firstId}});
        const QString revisedId = result["layerId"].toString();
        QCOMPARE(revisedId, firstId);
        call("afterimage_document", {{"layerId", firstId}});
        QCOMPARE(result["layer"].toObject()["name"].toString(), QString("Moved moon"));
        call("afterimage_preview", {{"scope", "canvas"}, {"maxEdge", 320}});
        const QImage movedPreview(result["previewPath"].toString());
        QCOMPARE(movedPreview.pixelColor(135, 120), QColor("#35406a"));
        QCOMPARE(movedPreview.pixelColor(180, 110), QColor("#f1d36b"));
        call("afterimage_document", {});
        const int historyIndex = result["history"].toObject()["index"].toInt();
        call("afterimage_undo", {{"expectedIndex", historyIndex}});
        call("afterimage_document", {{"layerId", firstId}});
        QCOMPARE(result["layer"].toObject()["id"].toString(), firstId);
        QCOMPARE(result["layer"].toObject()["name"].toString(), QString("Moon and lettering"));
        call("afterimage_preview", {{"scope", "canvas"}, {"maxEdge", 320}});
        const QImage restoredPreview(result["previewPath"].toString());
        QCOMPARE(restoredPreview.pixelColor(160, 120), QColor("#f1d36b"));
        const QString kra = directory.filePath("night-garden.kra");
        call("afterimage_save", {{"path", kra}});
        QVERIFY(QFileInfo::exists(kra));
        const QString png = directory.filePath("night-garden.png");
        call("afterimage_export_png", {{"path", png}});
        QVERIFY(QFileInfo::exists(png));
        QScopedPointer<KisDocument> reopened(KisPart::instance()->createDocument());
        reopened->setFileBatchMode(true);
        QVERIFY(reopened->loadNativeFormat(kra));
        reopened->image()->waitForDone();
        QCOMPARE(reopened->image()->width(), 320);
        QCOMPARE(reopened->image()->height(), 240);
        QCOMPARE(QImage(png).size(), QSize(320, 240));
        QCOMPARE(QImage(png).pixelColor(160, 120), QColor("#f1d36b"));
        // The test created a headless Part document. Release it before the
        // QApplication and Part singletons enter their shutdown sequence.
        bridge.bindDocument(nullptr);
        KisPart::instance()->removeDocument(document, false);
        delete document;
    }
    void compositorArtworkMigration()
    {
        const QString source = qEnvironmentVariable("AFTERIMAGE_MIGRATION_SOURCE");
        if (source.isEmpty()) QSKIP("Set AFTERIMAGE_MIGRATION_SOURCE to exercise an existing Compositor artwork.");
        const QString output = qEnvironmentVariable("AFTERIMAGE_MIGRATION_OUTPUT");
        QVERIFY(!output.isEmpty());
        QVERIFY(QDir().mkpath(output));
        AfterimageCompositorImport importer;
        QScopedPointer<KisDocument> document;
        bool done = false;
        QString message;
        importer.load(source, [&](KisDocument *result, const QString &details) { document.reset(result); message = details; done = true; });
        QTRY_VERIFY_WITH_TIMEOUT(done, 30000);
        QVERIFY2(document, qPrintable(message));
        document->image()->waitForDone();
        const int count = document->image()->rootLayer()->childCount();
        QVERIFY(count > 1);
        int textLayers = 0;
        int masks = 0;
        int hidden = 0;
        for (auto node = document->image()->rootLayer()->firstChild(); node; node = node->nextSibling()) {
            if (auto *layer = dynamic_cast<KisShapeLayer *>(node.data())) { QVERIFY(!layer->shapes().isEmpty()); ++textLayers; }
            masks += node->childCount();
            if (!node->visible()) ++hidden;
        }
        document->setFileBatchMode(true);
        QVERIFY(document->exportDocumentSync(output + "/afterimage-migrated.kra", "application/x-krita"));
        QVERIFY(document->exportDocumentSync(output + "/afterimage-migrated.png", "image/png"));
        QScopedPointer<KisDocument> reopened(KisPart::instance()->createDocument());
        reopened->setFileBatchMode(true);
        QVERIFY(reopened->loadNativeFormat(output + "/afterimage-migrated.kra"));
        reopened->image()->waitForDone();
        QCOMPARE(reopened->image()->rootLayer()->childCount(), count);
        QCOMPARE(reopened->image()->projection()->convertToQImage(nullptr, reopened->image()->bounds()),
            document->image()->projection()->convertToQImage(nullptr, document->image()->bounds()));
        qInfo() << "Migrated and reopened" << count << "layers;" << textLayers << "editable text layers;" << masks << "masks;" << hidden << "hidden alternatives.";
        // A separate copy seeds the live subscription edit trial; the migrated artwork stays unchanged.
        if (document->image()->width() == 2048 && document->image()->height() == 2048) {
            KisSelectionSP trial = new KisSelection();
            trial->pixelSelection()->select(QRect(145, 1310, 515, 550), 255);
            trial->updateProjection();
            KisSelectionMaskSP mask = new KisSelectionMask(document->image(), "Crop edit trial");
            mask->setSelection(trial);
            document->image()->addNode(mask, document->image()->rootLayer());
            mask->setActive(true);
            document->image()->waitForDone();
            QVERIFY(document->exportDocumentSync(output + "/afterimage-edit-trial.kra", "application/x-krita"));
        }
    }
    void layeredArtworkToRetainedEditToSavedDocument()
    {
        QTemporaryDir directory;
        QVERIFY(directory.isValid());
        QScopedPointer<KisDocument> document(KisPart::instance()->createDocument());
        document->setFileBatchMode(true);
        document->setProperty("afterimageId", "workflow-original");
        QVERIFY(document->newImage("Comic panel", 256, 192, KoColorSpaceRegistry::instance()->rgb8(),
            KoColor(Qt::blue, KoColorSpaceRegistry::instance()->rgb8()), KisConfig::RASTER_LAYER, 2, "", 96));
        KisImageSP image = document->image();
        image->waitForDone();
        // The irregular mask has a feathered edge and an unselected hole.
        KisSelectionSP selection = new KisSelection();
        selection->pixelSelection()->select(QRect(40, 30, 80, 60), 128);
        selection->pixelSelection()->select(QRect(45, 35, 70, 50), 255);
        selection->pixelSelection()->select(QRect(60, 45, 10, 10), 0);
        selection->updateProjection();
        KisSelectionMaskSP selectionMask = new KisSelectionMask(image, "Edit area");
        selectionMask->setSelection(selection);
        image->addNode(selectionMask, image->rootLayer());
        selectionMask->setActive(true);
        image->waitForDone();
        QVERIFY(image->globalSelection());
        const QImage original = image->projection()->convertToQImage(nullptr, image->bounds());
        const int originalNodes = image->rootLayer()->childCount();
        AfterimageDocumentBridge bridge(directory.path());
        bool done = false;
        bool success = false;
        QJsonObject prepared;
        bridge.invoke(document.data(), "afterimage_prepare_edit", {{"scope", "selection"}}, [&](bool ok, const QJsonArray &content) {
            success = ok; prepared = QJsonDocument::fromJson(content.first().toObject()["text"].toString().toUtf8()).object(); done = true;
        });
        QTRY_VERIFY_WITH_TIMEOUT(done, 10000);
        QVERIFY2(success, qPrintable(QString::fromUtf8(QJsonDocument(prepared).toJson())));
        QCOMPARE(prepared["sourceRect"].toArray(), QJsonArray({40, 30, 80, 60}));
        QVERIFY(QFileInfo::exists(prepared["maskPath"].toString()));
        const QImage captured(prepared["previewPath"].toString());
        QCOMPARE(captured, original.copy(40, 30, 80, 60));

        // Provider artifact is deterministic; real subscription generation is exercised in the app.
        QImage generated(40, 30, QImage::Format_ARGB32);
        generated.fill(qRgba(255, 0, 0, 255));
        generated.setPixel(20, 20, qRgba(0, 0, 0, 0));
        const QString providerPath = directory.filePath("provider.png");
        QVERIFY(generated.save(providerPath));
        AfterimageImageStore store(directory.filePath("candidates"));
        QSignalSpy retained(&store, &AfterimageImageStore::retained);
        QSignalSpy failed(&store, &AfterimageImageStore::failed);
        store.retain({{"savedPath", providerPath}}, {{"model", "workflow-fixture"}, {"source", QJsonObject{
            {"documentId", "workflow-original"}, {"width", 256}, {"height", 192}, {"preparedSource", prepared}}}});
        QTRY_VERIFY_WITH_TIMEOUT(retained.count() || failed.count(), 10000);
        QCOMPARE(failed.count(), 0);
        const auto candidate = retained.first().first().toJsonObject();
        QCOMPARE(QImage(candidate["path"].toString()), generated);
        QVERIFY(QFile::remove(prepared["previewPath"].toString()));
        QVERIFY(QFile::remove(prepared["maskPath"].toString()));
        // Artist changes selection while the generator is working; placement must keep the captured shape.
        selectionMask->selection()->pixelSelection()->clear();
        selectionMask->selection()->pixelSelection()->select(QRect(180, 130, 20, 20), 255);
        selectionMask->selection()->updateProjection();
        image->waitForDone();
        done = false;
        QJsonObject placed;
        bridge.place(document.data(), candidate, true, true, [&](bool ok, const QJsonArray &content) {
            success = ok; placed = QJsonDocument::fromJson(content.first().toObject()["text"].toString().toUtf8()).object(); done = true;
        });
        QTRY_VERIFY_WITH_TIMEOUT(done, 10000);
        QVERIFY2(success, qPrintable(QString::fromUtf8(QJsonDocument(placed).toJson())));
        image->waitForDone();
        QCOMPARE(image->rootLayer()->childCount(), originalNodes + 1);
        const auto layer = image->rootLayer()->lastChild();
        QCOMPARE(layer->childCount(), 1);
        QCOMPARE(QString(layer->firstChild()->metaObject()->className()), QString("KisTransparencyMask"));
        const QImage edited = image->projection()->convertToQImage(nullptr, image->bounds());
        QCOMPARE(edited.pixelColor(50, 40), QColor(Qt::red));
        QCOMPARE(edited.pixelColor(65, 50), original.pixelColor(65, 50));
        QCOMPARE(edited.pixelColor(80, 70), original.pixelColor(80, 70));
        for (int y = 0; y < edited.height(); ++y) for (int x = 0; x < edited.width(); ++x)
            if (!QRect(40, 30, 80, 60).contains(x, y)) QCOMPARE(edited.pixel(x, y), original.pixel(x, y));
        QVERIFY(edited.pixelColor(41, 31).red() > 100 && edited.pixelColor(41, 31).red() < 200);
        document->undoStack()->undo(); image->waitForDone();
        QCOMPARE(image->projection()->convertToQImage(nullptr, image->bounds()), original);
        document->undoStack()->redo(); image->waitForDone();
        QCOMPARE(image->projection()->convertToQImage(nullptr, image->bounds()), edited);

        const QString kra = directory.filePath("finished.kra");
        QVERIFY(document->exportDocumentSync(kra, "application/x-krita"));
        QScopedPointer<KisDocument> reopened(KisPart::instance()->createDocument());
        reopened->setFileBatchMode(true);
        QVERIFY(reopened->loadNativeFormat(kra));
        reopened->image()->waitForDone();
        QCOMPARE(reopened->image()->rootLayer()->childCount(), originalNodes + 1);
        QCOMPARE(reopened->image()->projection()->convertToQImage(nullptr, image->bounds()), edited);
        const QString png = directory.filePath("finished.png");
        QVERIFY(reopened->exportDocumentSync(png, "image/png"));
        QCOMPARE(QImage(png).convertToFormat(QImage::Format_ARGB32), edited.convertToFormat(QImage::Format_ARGB32));
    }
};
KISTEST_MAIN(WorkflowTest)
#include "WorkflowTest.moc"
