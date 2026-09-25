// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Opt-in real app-server run. No visible UI, desktop control, or provider payload logging.
#include "../AfterimageDocumentBridge.h"
#include "../AfterimageSession.h"
#include <QDir>
#include <QFileInfo>
#include <QImage>
#include <QJsonDocument>
#include <QSaveFile>
#include <QSignalSpy>
#include <QStandardPaths>
#include <KisDocument.h>
#include <KisPart.h>
#include <kis_image.h>
#include <kis_group_layer.h>
#include <testui.h>

class LiveAgentWorkflow : public QObject
{
    Q_OBJECT
private Q_SLOTS:
    void neutralThreePanelComic()
    {
        if (qEnvironmentVariable("QT_QPA_PLATFORM") != "offscreen")
            QSKIP("Set QT_QPA_PLATFORM=offscreen; live agent tests may not show windows.");
        const QString model = qEnvironmentVariable("AFTERIMAGE_LIVE_MODEL");
        const QString runtime = qEnvironmentVariable("AFTERIMAGE_LIVE_CODEX");
        const QString output = qEnvironmentVariable("AFTERIMAGE_LIVE_OUTPUT");
        if (model.isEmpty() || runtime.isEmpty() || output.isEmpty())
            QSKIP("Set AFTERIMAGE_LIVE_MODEL, AFTERIMAGE_LIVE_CODEX and AFTERIMAGE_LIVE_OUTPUT explicitly.");
        QVERIFY(model == "gpt-6-sol" || model == "gpt-6-luna");
        QVERIFY(QFileInfo(runtime).isExecutable());
        QVERIFY(QDir().mkpath(output));
        const QString root = qEnvironmentVariable("AFTERIMAGE_LIVE_STATE",
            QStandardPaths::writableLocation(QStandardPaths::GenericDataLocation) + "/Afterimage/chat");
        AfterimageSession session(root, runtime);
        AfterimageDocumentBridge bridge(session.workspace());
        bridge.bindDocument(nullptr);
        struct RemoveHeadlessArtwork {
            AfterimageDocumentBridge &bridge;
            ~RemoveHeadlessArtwork() {
                KisDocument *document = bridge.boundDocument();
                bridge.bindDocument(nullptr);
                if (document) {
                    KisPart::instance()->removeDocument(document, false);
                    delete document;
                }
            }
        } cleanup{bridge};
        session.setModel(model);
        session.setReasoningEffort("medium");
        bool signedIn = false;
        bool finished = false;
        bool steerAccepted = false;
        bool steerSubmitted = false;
        bool previewUsed = false;
        bool vectorUsed = false;
        bool vectorRevised = false;
        bool imageViewObserved = false;
        bool saveUsed = false;
        bool exportUsed = false;
        QString failure;
        QString turnStatus;
        QJsonArray toolEvidence;
        QObject::connect(&session, &AfterimageSession::readinessChanged, &session,
            [&](bool, bool authenticated) { signedIn = authenticated; });
        QObject::connect(&session, &AfterimageSession::failure, &session,
            [&](const QString &message) { failure = message.left(1000); });
        QObject::connect(&session, &AfterimageSession::steeringAccepted, &session,
            [&](const QString &) { steerAccepted = true; });
        QObject::connect(&session, &AfterimageSession::steeringFailed, &session,
            [&](const QString &message) { failure = message.left(1000); });
        QObject::connect(&session, &AfterimageSession::steeringAvailabilityChanged, &session,
            [&](bool available) {
                if (!available || steerSubmitted) return;
                steerSubmitted = true;
                session.steer("Keep the cat's face clear in each panel and make the three-panel reading order obvious.");
            });
        QObject::connect(&session, &AfterimageSession::requestReceived, &session,
            [&](const QJsonValue &id, const QString &method, const QJsonObject &params) {
                if (method != "item/tool/call") {
                    session.answer(id, {{"error", "This unattended native workflow only supports document tools."}});
                    return;
                }
                const QString tool = params["tool"].toString();
                previewUsed |= tool == "afterimage_preview";
                vectorUsed |= tool == "afterimage_svg_layer";
                vectorRevised |= tool == "afterimage_svg_layer" && !params["arguments"].toObject()["layerId"].toString().isEmpty();
                saveUsed |= tool == "afterimage_save";
                exportUsed |= tool == "afterimage_export_png";
                bridge.invoke(bridge.boundDocument(), tool, params["arguments"].toObject(),
                    [&, id, tool](bool ok, const QJsonArray &content) {
                        toolEvidence.append(QJsonObject{{"tool", tool}, {"success", ok}});
                        const QByteArray serialized = QJsonDocument(content).toJson(QJsonDocument::Compact);
                        if (serialized.size() > 65536 || serialized.contains("data:image/") || serialized.contains("inputImage")) {
                            failure = "A document tool attempted to return image bytes as model text.";
                            session.answer(id, {{"success", false}, {"contentItems", QJsonArray{}}});
                            return;
                        }
                        session.answer(id, {{"success", ok}, {"contentItems", content}});
                    });
            });
        QObject::connect(&session, &AfterimageSession::eventReceived, &session,
            [&](const QString &method, const QJsonObject &params) {
                if (method == "item/completed" && params["item"].toObject()["type"] == "imageView")
                    imageViewObserved = true;
                if (method != "turn/completed") return;
                finished = true;
                const auto turn = params["turn"].toObject();
                turnStatus = turn["status"].toString();
                if (turn["error"].isObject()) failure = turn["error"].toObject()["message"].toString().left(1000);
            });
        session.connectServer();
        QTRY_VERIFY_WITH_TIMEOUT(session.ready() && signedIn, 120000);
        session.newThread();
        const QString kra = QDir(output).absoluteFilePath("three-panel-cat.kra");
        const QString png = QDir(output).absoluteFilePath("three-panel-cat.png");
        const QString brief = QStringLiteral(
            "Create a new native Afterimage artwork from scratch: a simple, charming three-panel comic about a cat "
            "that sees a cardboard box, tries to fit inside, and proudly settles for sitting on top. "
            "Use a wide page, three clearly separated panels, coherent cat character, readable editable lettering, "
            "and native editable vector layers. Work through native document tools without activating any windows or views. "
            "Render a preview and inspect it with your image-viewing tool, then revise at least one native layer based on what you see. "
            "Save the editable KRA to %1 and export the final PNG to %2. Finish by reporting the actual file paths and what changed.")
            .arg(QDir::fromNativeSeparators(kra), QDir::fromNativeSeparators(png));
        session.send(brief, AfterimageDocumentBridge::documentSummary(nullptr), AfterimageDocumentBridge::tools());
        QTRY_VERIFY_WITH_TIMEOUT(finished || !failure.isEmpty(), 600000);
        const QJsonObject evidence{{"model", model}, {"turnStatus", turnStatus}, {"failure", failure},
            {"steeringAccepted", steerAccepted}, {"previewToolUsed", previewUsed},
            {"imageViewItemObserved", imageViewObserved}, {"vectorToolUsed", vectorUsed},
            {"targetedVectorRevision", vectorRevised}, {"saveToolUsed", saveUsed},
            {"exportToolUsed", exportUsed}, {"kraPath", kra}, {"pngPath", png},
            {"toolCalls", toolEvidence}};
        QSaveFile evidenceFile(QDir(output).absoluteFilePath("semantic-evidence.json"));
        QVERIFY(evidenceFile.open(QIODevice::WriteOnly));
        const QByteArray evidenceBytes = QJsonDocument(evidence).toJson(QJsonDocument::Indented);
        QCOMPARE(evidenceFile.write(evidenceBytes), qint64(evidenceBytes.size()));
        QVERIFY(evidenceFile.commit());
        QVERIFY2(failure.isEmpty(), qPrintable(failure));
        QCOMPARE(turnStatus, QString("completed"));
        QVERIFY(steerAccepted);
        QVERIFY(previewUsed);
        QVERIFY(imageViewObserved);
        QVERIFY(vectorUsed);
        QVERIFY(vectorRevised);
        QVERIFY(saveUsed);
        QVERIFY(exportUsed);
        QVERIFY(QFileInfo::exists(kra));
        QVERIFY(QFileInfo::exists(png));
        KisDocument *bound = bridge.boundDocument();
        QVERIFY(bound);
        QScopedPointer<KisDocument> reopened(KisPart::instance()->createDocument());
        reopened->setFileBatchMode(true);
        QVERIFY(reopened->loadNativeFormat(kra));
        reopened->image()->waitForDone();
        QVERIFY(reopened->image()->rootLayer()->childCount() >= 2);
        QCOMPARE(QImage(png).size(), reopened->image()->size());
        qInfo() << "Live native comic saved and reopened:" << kra << png << "model:" << model;
    }
};
KISTEST_MAIN(LiveAgentWorkflow)
#include "LiveAgentWorkflow.moc"
