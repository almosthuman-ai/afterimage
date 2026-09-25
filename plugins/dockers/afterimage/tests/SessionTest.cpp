// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#include "../AfterimageSession.h"
#include "../AfterimageImageStore.h"
#include <QBuffer>
#include <QFile>
#include <QImage>
#include <QCoreApplication>
#include <QJsonDocument>
#include <QSettings>
#include <QSignalSpy>
#include <QStandardPaths>
#include <QTemporaryDir>
#include <QTest>
#include <iostream>

namespace {
void output(const QJsonObject &message)
{
    const QByteArray data = QJsonDocument(message).toJson(QJsonDocument::Compact) + '\n';
    // Deliberately split frames; the transport must not assume one read per message.
    std::cout.write(data.constData(), 7).flush();
    std::cout.write(data.constData() + 7, data.size() - 7).flush();
}
int fixture()
{
    std::string line;
    while (std::getline(std::cin, line)) {
        const auto request = QJsonDocument::fromJson(QByteArray::fromStdString(line)).object();
        const auto method = request["method"].toString();
        if (!request.contains("id")) continue;
        if ((method == "thread/start" || method == "turn/start") && request["params"].toObject()["model"] != "fixture-model") {
            output({{"id", request["id"]}, {"error", QJsonObject{{"message", "The explicitly selected model was not sent."}}}});
            continue;
        }
        if (method == "turn/start" && request["params"].toObject()["effort"] != "high") {
            output({{"id", request["id"]}, {"error", QJsonObject{{"message", "The explicitly selected reasoning effort was not sent."}}}});
            continue;
        }
        if (method == "turn/steer") {
            const auto params = request["params"].toObject();
            if (params["threadId"] != "new-thread" || params["expectedTurnId"] != "active-turn"
                || params["input"].toArray().first().toObject()["type"] != "text") {
                output({{"id", request["id"]}, {"error", QJsonObject{{"message", "Steering lost its active-turn binding."}}}});
                continue;
            }
        }
        QJsonObject result;
        if (method == "account/read") result["account"] = QJsonObject{{"type", "chatgpt"}, {"planType", "plus"}};
        else if (method == "model/list") result["data"] = QJsonArray{};
        else if (method == "thread/list") result["data"] = QJsonArray{QJsonObject{{"id", "existing"}, {"preview", "Earlier artwork"}}};
        else if (method == "thread/turns/list") {
            const bool older = request["params"].toObject().contains("cursor");
            result["data"] = QJsonArray{QJsonObject{{"id", older ? "turn-1" : "turn-3"}, {"items", QJsonArray{}}},
                                       QJsonObject{{"id", older ? "turn-0" : "turn-2"}, {"items", QJsonArray{}}}};
            if (!older) result["nextCursor"] = "older-page";
        }
        else if (method == "thread/start" || method == "thread/resume") {
            const QString id = method == "thread/start" ? "new-thread" : request["params"].toObject()["threadId"].toString();
            result["thread"] = QJsonObject{{"id", id}, {"turns", QJsonArray{}}};
        } else if (method == "turn/start") result["turn"] = QJsonObject{{"id", "active-turn"}};
        output({{"id", request["id"]}, {"result", result}});
        if (method == "windowsSandbox/setupStart") output({{"method", "windowsSandbox/setupCompleted"}, {"params", QJsonObject{{"success", true}, {"mode", "unelevated"}}}});
        if (method == "turn/start") {
            output({{"method", "item/agentMessage/delta"}, {"params", QJsonObject{{"threadId", "some-other-thread"}, {"delta", "wrong"}}}});
            output({{"method", "item/agentMessage/delta"}, {"params", QJsonObject{{"threadId", "new-thread"}, {"itemId", "reply"}, {"delta", "hello"}}}});
        }
        if (method == "turn/interrupt") output({{"method", "turn/completed"}, {"params", QJsonObject{
            {"threadId", request["params"].toObject()["threadId"]}, {"turn", QJsonObject{{"status", "interrupted"}}}}}});
    }
    return 0;
}
}

class SessionTest : public QObject
{
    Q_OBJECT
    QTemporaryDir sessionDirectory;
    QVariant originalRuntime;
private Q_SLOTS:
    void initTestCase()
    {
        QStandardPaths::setTestModeEnabled(true);
        originalRuntime = QSettings("Afterimage", "Afterimage").value("Afterimage/codexExecutable");
    }
    void conversationLifecycle()
    {
        AfterimageSession session(sessionDirectory.path(), QCoreApplication::applicationFilePath());
        session.setModel("fixture-model");
        session.setReasoningEffort("high");
        QSignalSpy account(&session, &AfterimageSession::readinessChanged);
        QSignalSpy threads(&session, &AfterimageSession::threadsReceived);
        QSignalSpy events(&session, &AfterimageSession::eventReceived);
        QSignalSpy transcript(&session, &AfterimageSession::transcriptReceived);
        QSignalSpy history(&session, &AfterimageSession::historyPageReceived);
        QSignalSpy failure(&session, &AfterimageSession::failure);
        QSignalSpy steered(&session, &AfterimageSession::steeringAccepted);
        connect(&session, &AfterimageSession::failure, this, [](const QString &message) { qWarning() << message; });
        session.connectServer();
        QTRY_VERIFY_WITH_TIMEOUT(account.count() > 0, 5000);
        QVERIFY(account.last()[1].toBool());
        QTRY_VERIFY(session.ready());
        QTRY_VERIFY(threads.count() > 0);
        session.send("Make a comic", {{"documentId", "artwork-a"}}, {});
        QVERIFY(session.busy());
        QTRY_COMPARE(session.threadId(), QString("new-thread"));
        QTRY_VERIFY(events.count() > 0);
        QVERIFY(session.canSteer());
        session.steer("Keep the cat's face readable.");
        QTRY_COMPARE(steered.count(), 1);
        for (const auto &event : events) QVERIFY(event[1].toJsonObject()["delta"] != "wrong");
        session.newThread();
        QCOMPARE(session.threadId(), QString("new-thread"));
        session.interrupt();
        QTRY_VERIFY(!session.busy());
        session.newThread();
        QVERIFY(session.threadId().isEmpty());
        QCOMPARE(transcript.count(), 1);
        session.openThread("existing");
        QTRY_COMPARE(session.threadId(), QString("existing"));
        QTRY_VERIFY(!session.busy());
        QCOMPARE(transcript.count(), 2);
        QCOMPARE(history.count(), 1);
        QCOMPARE(history.first()[0].toJsonArray().first().toObject()["id"].toString(), QString("turn-2"));
        session.loadEarlierMessages();
        QTRY_COMPARE(history.count(), 2);
        QVERIFY(history.last()[1].toBool());
        QCOMPARE(history.last()[0].toJsonArray().first().toObject()["id"].toString(), QString("turn-0"));
        QVERIFY(history.last()[2].toString().isEmpty());
        QCOMPARE(failure.count(), 0);
    }
    void reconnectKeepsConversation()
    {
        AfterimageSession session(sessionDirectory.path(), QCoreApplication::applicationFilePath());
        QSignalSpy account(&session, &AfterimageSession::readinessChanged);
        session.connectServer();
        QTRY_VERIFY(session.ready());
        session.openThread("existing");
        QTRY_COMPARE(session.threadId(), QString("existing"));
        const int previous = account.count();
        session.reconnectServer();
        QTRY_VERIFY_WITH_TIMEOUT(account.count() >= previous + 2, 5000);
        QTRY_VERIFY(session.ready());
        QCOMPARE(session.threadId(), QString("existing"));
    }
    void candidatesPreserveAlphaAndProvenance()
    {
        QTemporaryDir directory;
        AfterimageImageStore store(directory.path());
        QSignalSpy retained(&store, &AfterimageImageStore::retained);
        QSignalSpy failed(&store, &AfterimageImageStore::failed);
        QImage image(3, 1, QImage::Format_ARGB32);
        image.setPixel(0, 0, qRgba(255, 0, 0, 0));
        image.setPixel(1, 0, qRgba(0, 255, 0, 127));
        image.setPixel(2, 0, qRgba(0, 0, 255, 255));
        QByteArray original;
        QBuffer buffer(&original); buffer.open(QIODevice::WriteOnly);
        QVERIFY(image.save(&buffer, "PNG"));
        const QJsonObject source{{"documentId", "original-artwork"}, {"selectionBounds", QJsonArray{10, 20, 3, 1}}};
        store.retain({{"result", QString::fromLatin1(original.toBase64())}}, {{"provider", "test-cloud"}, {"source", source}});
        QTRY_COMPARE(retained.count(), 1);
        const QJsonObject candidate = retained.first()[0].toJsonObject();
        QCOMPARE(candidate["source"].toObject(), source);
        QVERIFY(candidate["hasAlpha"].toBool());
        const QImage reopened(candidate["path"].toString());
        QCOMPARE(reopened.size(), image.size());
        for (int x = 0; x < 3; ++x) QCOMPARE(reopened.pixel(x, 0), image.pixel(x, 0));
        QFile preserved(QFileInfo(candidate["path"].toString()).dir().filePath("provider-original"));
        QVERIFY(preserved.open(QIODevice::ReadOnly));
        QCOMPARE(preserved.readAll(), original);
        // A future local engine submits the same artifact without a cloud dependency.
        store.retain({{"savedPath", candidate["path"]}}, {{"provider", "test-local"}, {"source", source}});
        QTRY_COMPARE(retained.count(), 2);
        QCOMPARE(retained.last()[0].toJsonObject()["source"].toObject(), source);
        QVERIFY(retained.last()[0].toJsonObject()["id"] != candidate["id"]);
        store.retain({{"result", "not-an-image"}}, {{"provider", "test-invalid"}});
        QTRY_COMPARE(failed.count(), 1);
        QCOMPARE(retained.count(), 2);
    }
    void candidateOwnsSourcePreview()
    {
        QTemporaryDir directory;
        const QString preview = directory.filePath("input.png");
        QImage image(8, 8, QImage::Format_ARGB32);
        image.fill(qRgba(30, 50, 70, 127));
        QVERIFY(image.save(preview));
        AfterimageImageStore store(directory.filePath("candidates"));
        QSignalSpy retained(&store, &AfterimageImageStore::retained);
        store.retain({{"savedPath", preview}}, {{"source", QJsonObject{
            {"preparedSource", QJsonObject{{"previewPath", preview}, {"sourceRect", QJsonArray{10, 20, 8, 8}}}}}}});
        QTRY_COMPARE(retained.count(), 1);
        const auto candidate = retained.first()[0].toJsonObject();
        const auto prepared = candidate["source"].toObject()["preparedSource"].toObject();
        QVERIFY(prepared["previewPath"].toString() != preview);
        QVERIFY(QFile::remove(preview));
        QCOMPARE(QImage(prepared["previewPath"].toString()), image);
        QCOMPARE(prepared["sourceRect"].toArray(), QJsonArray({10, 20, 8, 8}));
    }
    void cleanupTestCase()
    {
        QCOMPARE(QSettings("Afterimage", "Afterimage").value("Afterimage/codexExecutable"), originalRuntime);
    }
};

int main(int argc, char **argv)
{
    QCoreApplication app(argc, argv);
    if (app.arguments().contains("app-server")) return fixture();
    app.setApplicationName("AfterimageSessionTests");
    SessionTest test;
    return QTest::qExec(&test, argc, argv);
}
#include "SessionTest.moc"
