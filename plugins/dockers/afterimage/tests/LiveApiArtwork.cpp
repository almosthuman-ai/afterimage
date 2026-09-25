// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Opt-in two-provider, one-composition proof. No visible window or desktop input.
#include "../AfterimageApiImages.h"
#include "../AfterimageDocumentBridge.h"
#include "../AfterimageImageStore.h"
#include <QDir>
#include <QFileInfo>
#include <QImage>
#include <QJsonDocument>
#include <QSaveFile>
#include <KisDocument.h>
#include <KisPart.h>
#include <kis_group_layer.h>
#include <kis_image.h>
#include <testui.h>

class LiveApiArtwork : public QObject
{
    Q_OBJECT
private Q_SLOTS:
    void rooftopGarden()
    {
        if (qEnvironmentVariable("QT_QPA_PLATFORM") != "offscreen")
            QSKIP("Run only with QT_QPA_PLATFORM=offscreen.");
        const QString output = qEnvironmentVariable("AFTERIMAGE_API_OUTPUT");
        const QString googleKey = qEnvironmentVariable("GEMINI_API_KEY", qEnvironmentVariable("GOOGLE_API_KEY"));
        const QString openaiKey = qEnvironmentVariable("OPENAI_API_KEY");
        if (output.isEmpty() || googleKey.isEmpty() || openaiKey.isEmpty())
            QSKIP("Set output and both canonical provider API keys.");
        QVERIFY(QDir().mkpath(output));
        AfterimageImageStore store(output + "/candidates");
        AfterimageApiImages api(output, &store);
        api.setEphemeralKey("gemini", googleKey);
        api.setEphemeralKey("openai", openaiKey);
        AfterimageDocumentBridge bridge(output);
        bridge.setApiImages(&api);
        bridge.bindDocument(nullptr);
        bool done = false;
        bool success = false;
        QJsonObject result;
        const auto call = [&](const QString &tool, const QJsonObject &arguments, int timeout = 60000) {
            done = false; success = false; result = {};
            bridge.invoke(bridge.boundDocument(), tool, arguments, [&](bool ok, const QJsonArray &content) {
                success = ok;
                if (!content.isEmpty())
                    result = QJsonDocument::fromJson(content.first().toObject().value("text").toString().toUtf8()).object();
                done = true;
            });
            QTRY_VERIFY_WITH_TIMEOUT(done, timeout);
        };
        call("afterimage_create_document", {{"title", "Rooftop garden robot"}, {"width", 1536},
            {"height", 864}, {"background", "#fff8e9"}});
        QVERIFY2(success, qPrintable(QString::fromUtf8(QJsonDocument(result).toJson())));
        KisDocument *document = bridge.boundDocument();
        QVERIFY(document);
        document->setFileBatchMode(true);
        struct Cleanup {
            AfterimageDocumentBridge *bridge;
            KisDocument *document;
            ~Cleanup() {
                bridge->bindDocument(nullptr);
                if (document) { KisPart::instance()->removeDocument(document, false); delete document; }
            }
        } cleanup{&bridge, document};
        const QString docId = result.value("documentId").toString();
        QVERIFY(!docId.isEmpty());

        const QString artPrompt = QStringLiteral(
            "Create one complete, warmly illustrated three-panel comic page, landscape 16:9. "
            "Exactly three equal vertical panels with clear gutters. A small friendly brass robot tends a rooftop garden "
            "above a quiet city. Left panel: the robot gently waters seedlings in terracotta pots at dawn. "
            "Middle panel: a passing rain cloud and wind bend the herbs; the robot protects one little sprout. "
            "Right panel: sunlight returns and new leaves lift toward it. Keep the robot's design consistent across all panels. "
            "Hand-inked linework, expressive shapes, inviting muted colors, clear visual storytelling. "
            "Reserve a clean light strip near the top of every panel for lettering that will be added later. "
            "No text, no letters, no speech bubbles, no logos.");
        QString geminiJob;
        api.start(document, {{"provider", "gemini"}, {"model", "gemini-3-pro-image"}, {"prompt", artPrompt},
            {"scope", "none"}, {"intent", "replacement"}, {"aspect", "16:9"}},
            [&](bool ok, const QJsonObject &start) {
                success = ok;
                geminiJob = start.value("jobId").toString();
                result = start;
            });
        QVERIFY2(success && !geminiJob.isEmpty(), qPrintable(QString::fromUtf8(QJsonDocument(result).toJson())));
        QJsonObject geminiResult;
        api.wait(geminiJob, [&](bool ok, const QJsonObject &finished) { success = ok; geminiResult = finished; });
        QTRY_VERIFY_WITH_TIMEOUT(!geminiResult.isEmpty(), 600000);
        QVERIFY2(success, qPrintable(QString::fromUtf8(QJsonDocument(geminiResult).toJson())));
        const QString geminiId = geminiResult.value("candidateId").toString();
        QVERIFY(!geminiId.isEmpty());
        QFile geminiFile(output + "/candidates/" + geminiId + "/candidate.json");
        QVERIFY(geminiFile.open(QIODevice::ReadOnly));
        const QJsonObject geminiCandidate = QJsonDocument::fromJson(geminiFile.readAll()).object();
        QCOMPARE(geminiCandidate.value("source").toObject().value("documentId").toString(), docId);
        const auto place = [&](const QJsonObject &candidate) {
            done = false; success = false;
            bridge.place(document, candidate, true, false, [&](bool ok, const QJsonArray &content) {
                success = ok;
                result = QJsonDocument::fromJson(content.first().toObject().value("text").toString().toUtf8()).object();
                done = true;
            });
            QTRY_VERIFY_WITH_TIMEOUT(done, 60000);
        };
        place(geminiCandidate);
        QVERIFY2(success, qPrintable(QString::fromUtf8(QJsonDocument(result).toJson())));
        const QString artLayerId = result.value("layerId").toString();
        QVERIFY(!artLayerId.isEmpty());
        call("afterimage_preview", {{"scope", "canvas"}, {"maxEdge", 1536}});
        QVERIFY(success);
        const QImage initialArt(result.value("previewPath").toString());
        QCOMPARE(initialArt.size(), QSize(1536, 864));

        const QRect editRect(542, 100, 452, 700);
        call("afterimage_preview", {{"scope", "region"}, {"rect", QJsonObject{{"x", editRect.x()},
            {"y", editRect.y()}, {"width", editRect.width()}, {"height", editRect.height()}}}});
        QVERIFY(success);
        QVERIFY(QFileInfo::exists(result.value("previewPath").toString()));
        const QString editPrompt = QStringLiteral(
            "Edit this crop from the MIDDLE panel of the rooftop-garden robot comic. "
            "Keep the little brass robot, the protected sprout, the garden pots, the hand-inked style, and crop framing. "
            "Change the weather to a gentle clearing after rain: a patch of blue sky, one soft sunbeam and lively leaves "
            "with a few rain droplets. Make the visual change substantial and coherent, while preserving the original "
            "characters and perspective. No text or lettering.");
        QString openaiJob;
        api.start(document, {{"provider", "openai"}, {"model", "gpt-image-2.5-sunburst"}, {"prompt", editPrompt},
            {"scope", "region"}, {"rect", QJsonObject{{"x", editRect.x()}, {"y", editRect.y()},
                {"width", editRect.width()}, {"height", editRect.height()}}},
            {"intent", "replacement"}, {"aspect", "2:3"}},
            [&](bool ok, const QJsonObject &start) {
                success = ok; openaiJob = start.value("jobId").toString(); result = start;
            });
        QVERIFY2(success && !openaiJob.isEmpty(), qPrintable(QString::fromUtf8(QJsonDocument(result).toJson())));
        QJsonObject openaiResult;
        api.wait(openaiJob, [&](bool ok, const QJsonObject &finished) { success = ok; openaiResult = finished; });
        QTRY_VERIFY_WITH_TIMEOUT(!openaiResult.isEmpty(), 600000);
        QVERIFY2(success, qPrintable(QString::fromUtf8(QJsonDocument(openaiResult).toJson())));
        const QString openaiId = openaiResult.value("candidateId").toString();
        QFile openaiFile(output + "/candidates/" + openaiId + "/candidate.json");
        QVERIFY(openaiFile.open(QIODevice::ReadOnly));
        const QJsonObject openaiCandidate = QJsonDocument::fromJson(openaiFile.readAll()).object();
        QCOMPARE(openaiCandidate.value("source").toObject().value("documentId").toString(), docId);
        QVERIFY(QFileInfo::exists(output + "/candidates/" + openaiId + "/source.png"));
        QVERIFY(openaiCandidate.value("source").toObject().value("preparedSource").toObject().value("maskPath").toString().isEmpty());
        place(openaiCandidate);
        QVERIFY2(success, qPrintable(QString::fromUtf8(QJsonDocument(result).toJson())));
        const QString editLayerId = result.value("layerId").toString();
        QVERIFY(!editLayerId.isEmpty());
        call("afterimage_preview", {{"scope", "canvas"}, {"maxEdge", 1536}});
        QVERIFY(success);
        const QImage editedArt(result.value("previewPath").toString());
        QCOMPARE(editedArt.size(), initialArt.size());
        QCOMPARE(editedArt.pixelColor(100, 440), initialArt.pixelColor(100, 440));
        QCOMPARE(editedArt.pixelColor(1340, 440), initialArt.pixelColor(1340, 440));

        const QString lettering = QStringLiteral(
            "<svg xmlns='http://www.w3.org/2000/svg' width='1536' height='864'>"
            "<rect x='20' y='18' width='475' height='82' rx='18' fill='#fff8e9' opacity='.94'/>"
            "<rect x='530' y='18' width='475' height='82' rx='18' fill='#fff8e9' opacity='.94'/>"
            "<rect x='1040' y='18' width='475' height='82' rx='18' fill='#fff8e9' opacity='.94'/>"
            "<text x='48' y='72' fill='#20343c' font-family='Arial' font-size='34'>A little water</text>"
            "<text x='558' y='72' fill='#20343c' font-family='Arial' font-size='34'>A stubborn cloud</text>"
            "<text x='1068' y='72' fill='#20343c' font-family='Arial' font-size='34'>Still growing</text>"
            "</svg>");
        call("afterimage_svg_layer", {{"name", "Editable comic lettering"}, {"svg", lettering}});
        QVERIFY2(success, qPrintable(QString::fromUtf8(QJsonDocument(result).toJson())));
        const QString letteringLayerId = result.value("layerId").toString();
        QVERIFY(!letteringLayerId.isEmpty());
        const QString kra = output + "/rooftop-garden-robot.kra";
        const QString png = output + "/rooftop-garden-robot.png";
        call("afterimage_save", {{"path", kra}}, 120000);
        QVERIFY2(success && QFileInfo::exists(kra), qPrintable(QString::fromUtf8(QJsonDocument(result).toJson())));
        call("afterimage_export_png", {{"path", png}}, 120000);
        QVERIFY2(success && QFileInfo::exists(png), qPrintable(QString::fromUtf8(QJsonDocument(result).toJson())));
        QScopedPointer<KisDocument> reopened(KisPart::instance()->createDocument());
        reopened->setFileBatchMode(true);
        QVERIFY(reopened->loadNativeFormat(kra));
        reopened->image()->waitForDone();
        QCOMPARE(reopened->image()->size(), QSize(1536, 864));
        QCOMPARE(QImage(png).size(), QSize(1536, 864));
        const QJsonObject evidence{{"documentId", docId}, {"geminiJobId", geminiJob}, {"geminiCandidateId", geminiId},
            {"geminiImageModel", geminiCandidate.value("imageModel")}, {"openaiJobId", openaiJob},
            {"openaiCandidateId", openaiId}, {"openaiImageModel", openaiCandidate.value("imageModel")},
            {"sourceRect", openaiCandidate.value("source").toObject().value("preparedSource").toObject().value("sourceRect")},
            {"artLayerId", artLayerId}, {"editLayerId", editLayerId}, {"letteringLayerId", letteringLayerId},
            {"kra", kra}, {"png", png}};
        QSaveFile proof(output + "/semantic-evidence.json");
        QVERIFY(proof.open(QIODevice::WriteOnly));
        const QByteArray bytes = QJsonDocument(evidence).toJson(QJsonDocument::Indented);
        QCOMPARE(proof.write(bytes), qint64(bytes.size()));
        QVERIFY(proof.commit());
    }
};
KISTEST_MAIN(LiveApiArtwork)
#include "LiveApiArtwork.moc"
