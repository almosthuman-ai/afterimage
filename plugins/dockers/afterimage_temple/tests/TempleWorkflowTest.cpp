// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#include "../TempleRecipe.h"
#include "../TempleService.h"
#include "../TempleToolGateway.h"
#include <KisDocument.h>
#include <KisPart.h>
#include <KoColor.h>
#include <KoColorSpaceRegistry.h>
#include <QFileInfo>
#include <QFile>
#include <QDir>
#include <QJsonArray>
#include <QJsonDocument>
#include <QScopedPointer>
#include <QTemporaryDir>
#include <QUuid>
#include <kis_group_layer.h>
#include <kis_image.h>
#include <kundo2stack.h>
#include <testui.h>

// KisPart owns the open-document registry, while this test owns each document.
// Unregister before QScopedPointer deletes it, including when an assertion returns early.
class RegisteredDocument
{
public:
    explicit RegisteredDocument(KisDocument *document) : m_document(document) {
        KisPart::instance()->addDocument(document, false);
    }
    ~RegisteredDocument() { KisPart::instance()->removeDocument(m_document, false); }
private:
    KisDocument *m_document;
};

class TempleWorkflowTest : public QObject
{
    Q_OBJECT
private Q_SLOTS:
    void importedMaterialSurvivesKraMove()
    {
        QTemporaryDir directory;
        QVERIFY(directory.isValid());
        const QString originalMaterial = directory.filePath("picked-material.png");
        QImage sample(16, 16, QImage::Format_ARGB32);
        sample.fill(QColor("#e744a9"));
        QVERIFY(sample.save(originalMaterial));
        QScopedPointer<KisDocument> document(KisPart::instance()->createDocument());
        document->setFileBatchMode(true);
        QVERIFY(document->newImage("Material study", 160, 120, KoColorSpaceRegistry::instance()->rgb8(),
            KoColor(QColor("#20304a"), KoColorSpaceRegistry::instance()->rgb8()), KisConfig::RASTER_LAYER, 2, "", 96));
        RegisteredDocument registered(document.data());
        TempleToolGateway gateway;
        auto *service = TempleService::instance();
        const QString documentId = service->documentId(document.data());
        QJsonObject recipe = TempleRecipe::initial();
        recipe["layers"] = QJsonArray{QJsonObject{{"id", "picked"}, {"label", "Picked material"},
            {"filePath", originalMaterial}, {"enabled", true}, {"opacity", 1},
            {"blendMode", "normal"}, {"maskMode", "whole"}, {"maskScale", 48}, {"seed", 88}}};
        bool rendered = false; QJsonObject renderResult;
        gateway.invoke(document.data(), "afterimage_temple_render",
            {{"documentId", documentId}, {"recipe", recipe}, {"maxEdge", 0}},
            [&](bool ok, const QJsonObject &result) { Q_UNUSED(ok); renderResult = result; rendered = true; });
        QTRY_VERIFY_WITH_TIMEOUT(rendered, 60000);
        QVERIFY2(!renderResult.contains("error"), qPrintable(QJsonDocument(renderResult).toJson()));
        const QString renderId = renderResult["renderId"].toString();
        bool applied = false; QJsonObject applyResult;
        gateway.invoke(document.data(), "afterimage_temple_apply",
            {{"documentId", documentId}, {"renderId", renderId}},
            [&](bool ok, const QJsonObject &result) { Q_UNUSED(ok); applyResult = result; applied = true; });
        QTRY_VERIFY_WITH_TIMEOUT(applied, 30000);
        QVERIFY2(!applyResult.contains("error"), qPrintable(QJsonDocument(applyResult).toJson()));
        const QString layerId = applyResult["layerId"].toString();
        const QString retained = service->recipeForLayer(documentId, layerId)["layers"].toArray()
            .first().toObject()["filePath"].toString();
        QVERIFY(QFileInfo::exists(retained));
        QVERIFY(retained != originalMaterial);
        const QString kra = directory.filePath("portable-material.kra");
        QVERIFY(document->exportDocumentSync(kra, "application/x-krita"));
        QScopedPointer<KisDocument> reopened(KisPart::instance()->createDocument());
        reopened->setFileBatchMode(true);
        QVERIFY(reopened->loadNativeFormat(kra));
        RegisteredDocument reopenedRegistration(reopened.data());
        const QString backup = directory.filePath("retained-backup.png");
        QVERIFY(QFile::rename(retained, backup));
        const QString reopenedId = service->documentId(reopened.data());
        const QJsonObject portable = service->recipeForLayer(reopenedId, layerId);
        QVERIFY(!portable.isEmpty());
        const QString restored = portable["layers"].toArray().first().toObject()["filePath"].toString();
        QCOMPARE(restored, retained);
        QVERIFY(QFileInfo::exists(restored));
        QCOMPARE(QImage(restored), sample);
        const QString proofDirectory = qEnvironmentVariable("AFTERIMAGE_TEMPLE_PROOF_DIR");
        if (!proofDirectory.isEmpty()) {
            QVERIFY(QDir().mkpath(proofDirectory));
            const QString proofKra = QDir(proofDirectory).filePath("portable-material.kra");
            QFile::remove(proofKra);
            QVERIFY(QFile::copy(kra, proofKra));
            qInfo() << "Native Temple material KRA" << proofKra;
        }
    }
    void renderApplyUndoAndReopen()
    {
        QVERIFY2(!qEnvironmentVariable("AFTERIMAGE_TEMPLE_PROCESSING_ROOT").isEmpty(),
            "Set AFTERIMAGE_TEMPLE_PROCESSING_ROOT to the app-owned Processing 4.5.6 runtime.");
        QTemporaryDir directory;
        QVERIFY(directory.isValid());
        QScopedPointer<KisDocument> document(KisPart::instance()->createDocument());
        document->setFileBatchMode(true);
        QVERIFY(document->newImage("Temple artwork", 160, 120, KoColorSpaceRegistry::instance()->rgb8(),
            KoColor(QColor("#20304a"), KoColorSpaceRegistry::instance()->rgb8()), KisConfig::RASTER_LAYER, 2, "", 96));
        RegisteredDocument registered(document.data());
        KisImageSP image = document->image();
        image->waitForDone();
        const int originalLayers = image->rootLayer()->childCount();
        const QImage original = image->projection()->convertToQImage(nullptr, image->bounds());
        auto *service = TempleService::instance();
        TempleToolGateway gateway;
        const QString documentId = service->documentId(document.data());
        QVERIFY(!documentId.isEmpty());
        QVERIFY(gateway.tools().size() == 5);
        QJsonObject recipe = TempleRecipe::initial();
        recipe["seed"] = 250405;
        recipe["baseMode"] = "kone";
        recipe["processStage"] = "form";
        recipe["palette"] = QJsonArray{0xC4FF23, 0x833DFF, 0xFF58AD, 0x111525};
        recipe["effects"] = QJsonArray{};
        QJsonObject form = recipe["koneForm"].toObject();
        QJsonObject parameters = form["parameters"].toObject();
        parameters["ribCount"] = 36;
        parameters["budding"] = 0;
        form["parameters"] = parameters;
        recipe["koneForm"] = form;
        bool rendered = false, renderOk = false;
        QJsonObject renderResult;
        gateway.invoke(document.data(), "afterimage_temple_render",
            {{"documentId", documentId}, {"recipe", recipe}, {"maxEdge", 0}},
            [&](bool ok, const QJsonObject &result) { renderOk = ok; renderResult = result; rendered = true; });
        QTRY_VERIFY_WITH_TIMEOUT(rendered, 60000);
        QVERIFY(renderOk);
        QVERIFY2(!renderResult.contains("error"), qPrintable(QJsonDocument(renderResult).toJson()));
        const QString renderId = renderResult["renderId"].toString();
        QVERIFY(!renderId.isEmpty());
        QCOMPARE(renderResult["renderId"].toString(), renderId);
        QCOMPARE(renderResult["documentId"].toString(), documentId);
        QVERIFY(renderResult["fullSize"].toBool());
        QCOMPARE(QImage(renderResult["path"].toString()).size(), QSize(160, 120));
        QVERIFY(QFileInfo::exists(renderResult["path"].toString()));
        bool applied = false, applyOk = false;
        QJsonObject applyResult;
        gateway.invoke(document.data(), "afterimage_temple_apply",
            {{"documentId", documentId}, {"renderId", renderId}},
            [&](bool ok, const QJsonObject &result) { applyOk = ok; applyResult = result; applied = true; });
        QTRY_VERIFY_WITH_TIMEOUT(applied, 30000);
        QVERIFY(applyOk);
        QVERIFY2(!applyResult.contains("error"), qPrintable(QJsonDocument(applyResult).toJson()));
        image->waitForDone();
        QCOMPARE(image->rootLayer()->childCount(), originalLayers + 1);
        const auto layer = image->rootLayer()->lastChild();
        QVERIFY(layer);
        const QString layerId = layer->uuid().toString(QUuid::WithoutBraces);
        QCOMPARE(service->recipeForLayer(documentId, layerId)["seed"].toInt(), 250405);
        const QImage changed = image->projection()->convertToQImage(nullptr, image->bounds());
        QVERIFY(changed != original);
        document->undoStack()->undo(); image->waitForDone();
        QCOMPARE(image->rootLayer()->childCount(), originalLayers);
        QCOMPARE(image->projection()->convertToQImage(nullptr, image->bounds()), original);
        document->undoStack()->redo(); image->waitForDone();
        QCOMPARE(image->projection()->convertToQImage(nullptr, image->bounds()), changed);
        const QString kra = directory.filePath("temple.kra");
        QVERIFY(document->exportDocumentSync(kra, "application/x-krita"));
        QScopedPointer<KisDocument> reopened(KisPart::instance()->createDocument());
        reopened->setFileBatchMode(true);
        QVERIFY(reopened->loadNativeFormat(kra));
        RegisteredDocument reopenedRegistration(reopened.data());
        reopened->image()->waitForDone();
        QCOMPARE(reopened->image()->rootLayer()->childCount(), originalLayers + 1);
        QCOMPARE(reopened->image()->projection()->convertToQImage(nullptr, image->bounds()), changed);
        const QString reopenedId = service->documentId(reopened.data());
        QCOMPARE(service->recipeForLayer(reopenedId, layerId)["seed"].toInt(), 250405);
        const QString proofDirectory = qEnvironmentVariable("AFTERIMAGE_TEMPLE_PROOF_DIR");
        if (!proofDirectory.isEmpty()) {
            QVERIFY(QDir().mkpath(proofDirectory));
            const QString proofKra = QDir(proofDirectory).filePath("temple.kra");
            QFile::remove(proofKra);
            QVERIFY(QFile::copy(kra, proofKra));
            qInfo() << "Native Temple artwork KRA" << proofKra;
        }
        QVERIFY2(!qEnvironmentVariable("AFTERIMAGE_TEMPLE_FFMPEG").isEmpty(),
            "Set AFTERIMAGE_TEMPLE_FFMPEG to the app-owned FFmpeg binary for loop export.");
        QJsonObject loopRecipe = recipe;
        loopRecipe["loopFrames"] = 4; loopRecipe["loopFps"] = 8;
        loopRecipe["gifWidth"] = 160; loopRecipe["gifHeight"] = 120;
        loopRecipe["timeScore"] = QJsonArray{QJsonObject{
            {"id", "breathing-body"}, {"target", "form"}, {"owner", "form"}, {"parameter", "bodyRadius"},
            {"enabled", true}, {"points", QJsonArray{
                QJsonObject{{"time", 0}, {"value", .17}, {"ease", "smooth"}},
                QJsonObject{{"time", .5}, {"value", .38}, {"ease", "smooth"}}}}}};
        for (const QString &format : {QStringLiteral("gif"), QStringLiteral("mp4")}) {
            bool exported = false, exportOk = false;
            QJsonObject exportResult;
            gateway.invoke(document.data(), "afterimage_temple_export_loop",
                {{"documentId", documentId}, {"recipe", loopRecipe}, {"format", format}},
                [&](bool ok, const QJsonObject &result) { exportOk = ok; exportResult = result; exported = true; });
            QTRY_VERIFY_WITH_TIMEOUT(exported, 120000);
            QVERIFY2(exportOk, qPrintable(QJsonDocument(exportResult).toJson()));
            QCOMPARE(exportResult["format"].toString(), format);
            QCOMPARE(exportResult["frames"].toInt(), 4);
            QCOMPARE(exportResult["fps"].toInt(), 8);
            QFile encoded(exportResult["path"].toString());
            QVERIFY(encoded.open(QIODevice::ReadOnly));
            QVERIFY(encoded.size() > 100);
            const QByteArray header = encoded.read(12);
            if (format == "gif") QVERIFY(header.startsWith("GIF8"));
            else QCOMPARE(header.mid(4, 4), QByteArray("ftyp"));
            qInfo() << "Native Temple loop" << format << exportResult["path"].toString();
        }
    }
};
KISTEST_MAIN(TempleWorkflowTest)
#include "TempleWorkflowTest.moc"
