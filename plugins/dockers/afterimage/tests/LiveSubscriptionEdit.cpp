// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Opt-in, headless subscription edit of a copy of an existing native artwork.
#include "../AfterimageDocumentBridge.h"
#include "../AfterimageImageStore.h"
#include "../AfterimageSession.h"
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QImage>
#include <QJsonDocument>
#include <QSaveFile>
#include <QStandardPaths>
#include <KisDocument.h>
#include <KisPart.h>
#include <kis_group_layer.h>
#include <kis_image.h>
#include <kis_pixel_selection.h>
#include <kis_selection.h>
#include <kis_selection_mask.h>
#include <testui.h>

class LiveSubscriptionEdit : public QObject
{
    Q_OBJECT
private Q_SLOTS:
    void retainedNativeCrop()
    {
        if (qEnvironmentVariable("QT_QPA_PLATFORM") != "offscreen")
            QSKIP("Run only with QT_QPA_PLATFORM=offscreen.");
        const QString input = qEnvironmentVariable("AFTERIMAGE_EDIT_INPUT");
        const QString output = qEnvironmentVariable("AFTERIMAGE_EDIT_OUTPUT");
        const QString runtime = qEnvironmentVariable("AFTERIMAGE_LIVE_CODEX");
        if (input.isEmpty() || output.isEmpty() || runtime.isEmpty()) QSKIP("Set input KRA, output folder and Codex runtime.");
        QVERIFY(QFileInfo::exists(input));
        QVERIFY(QFileInfo(runtime).isExecutable());
        QVERIFY(QDir().mkpath(output));
        const QString workingKra = QDir(output).absoluteFilePath("three-panel-cat-edited.kra");
        const QString finalPng = QDir(output).absoluteFilePath("three-panel-cat-edited.png");
        QVERIFY(QFile::copy(input, workingKra));
        KisDocument *document = KisPart::instance()->createDocument();
        document->setFileBatchMode(true);
        struct Cleanup {
            KisDocument *document;
            ~Cleanup() {
                if (!document) return;
                KisPart::instance()->removeDocument(document, false);
                delete document;
            }
        } cleanup{document};
        QVERIFY(document->loadNativeFormat(workingKra));
        KisPart::instance()->addDocument(document);
        KisImageSP image = document->image();
        image->waitForDone();
        QCOMPARE(image->size(), QSize(1800, 720));
        // Small blank pocket in the middle panel: the model adds a gold star,
        // while the captured native mask limits placement to this exact crop.
        KisSelectionSP selection = new KisSelection();
        selection->pixelSelection()->select(QRect(1004, 235, 112, 95), 255);
        selection->updateProjection();
        KisSelectionMaskSP selectionMask = new KisSelectionMask(image, "Subscription edit area");
        selectionMask->setSelection(selection);
        image->addNode(selectionMask, image->rootLayer());
        selectionMask->setActive(true);
        image->waitForDone();
        const QString root = qEnvironmentVariable("AFTERIMAGE_LIVE_STATE",
            QStandardPaths::writableLocation(QStandardPaths::GenericDataLocation) + "/Afterimage/chat");
        AfterimageSession session(root, runtime);
        AfterimageDocumentBridge bridge(session.workspace());
        bridge.bindDocument(document);
        AfterimageImageStore store(session.workspace() + "/candidates");
        QJsonObject prepared;
        bool preparedDone = false;
        bool preparedOk = false;
        bridge.invoke(document, "afterimage_prepare_edit", {{"scope", "selection"}},
            [&](bool ok, const QJsonArray &content) {
                preparedOk = ok;
                prepared = QJsonDocument::fromJson(content.first().toObject()["text"].toString().toUtf8()).object();
                preparedDone = true;
            });
        QTRY_VERIFY_WITH_TIMEOUT(preparedDone, 30000);
        QVERIFY2(preparedOk, qPrintable(QString::fromUtf8(QJsonDocument(prepared).toJson())));
        QVERIFY(QFileInfo::exists(prepared["previewPath"].toString()));
        QVERIFY(QFileInfo::exists(prepared["maskPath"].toString()));
        const QJsonObject sourceSummary = AfterimageDocumentBridge::documentSummary(document);
        QString chosenModel;
        QString failure;
        QString turnStatus;
        QString retainedId;
        bool signedIn = false;
        bool catalogReceived = false;
        bool finished = false;
        bool imageGenerationSeen = false;
        bool candidateWaitUsed = false;
        bool candidatePlaced = false;
        bool saveUsed = false;
        bool exportUsed = false;
        int maxToolTextBytes = 0;
        QJsonObject tokenUsage;
        QJsonArray toolEvidence;
        QObject::connect(&session, &AfterimageSession::readinessChanged, &session,
            [&](bool, bool authenticated) { signedIn = authenticated; });
        QObject::connect(&session, &AfterimageSession::modelsReceived, &session,
            [&](const QJsonArray &models) {
                catalogReceived = true;
                bool luna = false;
                for (const auto &entry : models) {
                    const QJsonObject model = entry.toObject();
                    if (model["model"] == "gpt-6-luna" && !model["hidden"].toBool()) luna = true;
                }
                chosenModel = luna ? "gpt-6-luna" : "gpt-6-sol";
                session.setModel(chosenModel);
                session.setReasoningEffort("medium");
            });
        QObject::connect(&session, &AfterimageSession::failure, &session,
            [&](const QString &message) { failure = message.left(1000); });
        QObject::connect(&store, &AfterimageImageStore::retained, &bridge,
            [&](const QJsonObject &candidate) {
                bridge.markCandidateReady(candidate);
                retainedId = candidate["id"].toString();
            });
        QObject::connect(&store, &AfterimageImageStore::failedForItem, &bridge,
            [&](const QString &itemId, const QString &message) {
                bridge.markCandidateFailed(itemId, message);
                failure = message.left(1000);
            });
        QObject::connect(&session, &AfterimageSession::requestReceived, &session,
            [&](const QJsonValue &id, const QString &method, const QJsonObject &params) {
                if (method != "item/tool/call") {
                    session.answer(id, {{"error", "Only native artwork tools are available in this headless workflow."}});
                    return;
                }
                const QString tool = params["tool"].toString();
                candidateWaitUsed |= tool == "afterimage_wait_candidate";
                candidatePlaced |= tool == "afterimage_place_candidate";
                saveUsed |= tool == "afterimage_save";
                exportUsed |= tool == "afterimage_export_png";
                bridge.invoke(bridge.boundDocument(), tool, params["arguments"].toObject(),
                    [&, id, tool](bool ok, const QJsonArray &content) {
                        const int bytes = QJsonDocument(content).toJson(QJsonDocument::Compact).size();
                        maxToolTextBytes = qMax(maxToolTextBytes, bytes);
                        toolEvidence.append(QJsonObject{{"tool", tool}, {"success", ok}, {"textBytes", bytes}});
                        const QByteArray textPayload = QJsonDocument(content).toJson(QJsonDocument::Compact);
                        if (bytes > 65536 || textPayload.contains("data:image/") || textPayload.contains("inputImage")) {
                            failure = "A native tool attempted to return image bytes as text.";
                            session.answer(id, {{"success", false}, {"contentItems", QJsonArray{}}});
                        } else session.answer(id, {{"success", ok}, {"contentItems", content}});
                    });
            });
        QObject::connect(&session, &AfterimageSession::eventReceived, &session,
            [&](const QString &method, const QJsonObject &params) {
                if (method == "thread/tokenUsage/updated") {
                    tokenUsage = params["tokenUsage"].toObject();
                } else if (method == "item/completed") {
                    const QJsonObject item = params["item"].toObject();
                    if (item["type"] == "imageGeneration") {
                        imageGenerationSeen = true;
                        const QString itemId = item["id"].toString();
                        const QJsonValue providerFailure = item["failure"];
                        if (!providerFailure.isNull() && !providerFailure.isUndefined()) {
                            const QString reason = providerFailure.isString() ? providerFailure.toString()
                                : providerFailure.toObject()["message"].toString("The image provider failed.");
                            failure = reason.left(1000);
                            bridge.markCandidateFailed(itemId, failure);
                            return;
                        }
                        bridge.markCandidatePending(itemId);
                        store.retain(item, {{"provider", "chatgpt-subscription"}, {"model", chosenModel},
                            {"reasoningEffort", "medium"}, {"threadId", session.threadId()}, {"itemId", itemId},
                            {"prompt", item["revisedPrompt"]}, {"source", QJsonObject{{"documentId", sourceSummary["documentId"]},
                                {"filePath", workingKra}, {"width", image->width()}, {"height", image->height()},
                                {"preparedSource", prepared}}}});
                    }
                } else if (method == "turn/completed") {
                    finished = true;
                    const QJsonObject turn = params["turn"].toObject();
                    turnStatus = turn["status"].toString();
                    if (turn["tokenUsage"].isObject()) tokenUsage = turn["tokenUsage"].toObject();
                    if (turn["error"].isObject()) failure = turn["error"].toObject()["message"].toString().left(1000);
                }
            });
        session.connectServer();
        QTRY_VERIFY_WITH_TIMEOUT(session.ready() && signedIn && catalogReceived, 120000);
        session.newThread();
        QJsonObject context = AfterimageDocumentBridge::documentSummary(document);
        context["preparedSource"] = prepared;
        const QString brief = QStringLiteral(
            "Edit the attached selected crop from the middle panel of this three-panel cat comic using subscription image generation. "
            "Add one small warm golden four-point sparkle above and to the right of the cat, fitting the comic's linework. "
            "Keep the rest of the crop and its framing intact. Retain the generated result, wait for its exact image-generation item "
            "with afterimage_wait_candidate, then place that candidate into this bound artwork with afterimage_place_candidate "
            "using alignToSource. The selected area is already captured as a native mask. The artist authorized this edit; "
            "complete it without a separate placement approval. Preview the changed panel, save the edited native KRA to %1 "
            "and export the final PNG to %2. Do not alter the original KRA at %3. Use native document tools only.")
            .arg(QDir::fromNativeSeparators(workingKra), QDir::fromNativeSeparators(finalPng), QDir::fromNativeSeparators(input));
        session.send(brief, context, AfterimageDocumentBridge::tools());
        QTRY_VERIFY_WITH_TIMEOUT(finished || !failure.isEmpty(), 600000);
        const QJsonObject evidence{{"model", chosenModel}, {"lunaAdvertised", chosenModel == "gpt-6-luna"},
            {"reasoningEffort", "medium"}, {"turnStatus", turnStatus}, {"failure", failure},
            {"imageGenerationSeen", imageGenerationSeen}, {"candidateId", retainedId},
            {"candidateWaitUsed", candidateWaitUsed}, {"candidatePlaced", candidatePlaced},
            {"saveUsed", saveUsed}, {"exportUsed", exportUsed}, {"maxToolTextBytes", maxToolTextBytes},
            {"tokenUsage", tokenUsage}, {"toolCalls", toolEvidence},
            {"sourceKra", input}, {"editedKra", workingKra}, {"editedPng", finalPng}};
        QSaveFile evidenceFile(QDir(output).absoluteFilePath("semantic-evidence.json"));
        QVERIFY(evidenceFile.open(QIODevice::WriteOnly));
        const QByteArray bytes = QJsonDocument(evidence).toJson(QJsonDocument::Indented);
        QCOMPARE(evidenceFile.write(bytes), qint64(bytes.size()));
        QVERIFY(evidenceFile.commit());
        QVERIFY2(failure.isEmpty(), qPrintable(failure));
        QCOMPARE(turnStatus, QString("completed"));
        QVERIFY(imageGenerationSeen);
        QVERIFY(!retainedId.isEmpty());
        QVERIFY(candidateWaitUsed);
        QVERIFY(candidatePlaced);
        QVERIFY(saveUsed && exportUsed);
        QVERIFY(QFileInfo::exists(workingKra));
        QVERIFY(QFileInfo::exists(finalPng));
        QScopedPointer<KisDocument> reopened(KisPart::instance()->createDocument());
        reopened->setFileBatchMode(true);
        QVERIFY(reopened->loadNativeFormat(workingKra));
        reopened->image()->waitForDone();
        QCOMPARE(QImage(finalPng).size(), reopened->image()->size());
        QVERIFY(QFileInfo::exists(input));
    }
};
KISTEST_MAIN(LiveSubscriptionEdit)
#include "LiveSubscriptionEdit.moc"
