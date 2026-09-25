// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#include "../AfterimageApiImages.h"
#include "../AfterimageImageStore.h"
#include <QBuffer>
#include <QDir>
#include <QFileInfo>
#include <QImage>
#include <QJsonArray>
#include <QJsonDocument>
#include <QSignalSpy>
#include <QTcpServer>
#include <QTcpSocket>
#include <QTemporaryDir>
#include <QtTest>
#include <memory>

class ApiImagesTest : public QObject
{
    Q_OBJECT
private Q_SLOTS:
    void directProvidersRetainOnlyFileReferences()
    {
        QTemporaryDir directory;
        QVERIFY(directory.isValid());
        QImage image(24, 16, QImage::Format_ARGB32);
        image.fill(Qt::transparent);
        image.setPixelColor(4, 4, Qt::red);
        QByteArray png;
        QBuffer buffer(&png);
        QVERIFY(buffer.open(QIODevice::WriteOnly));
        QVERIFY(image.save(&buffer, "PNG"));

        QTcpServer server;
        QVERIFY(server.listen(QHostAddress::LocalHost));
        QByteArray lastRequest;
        QJsonObject response;
        connect(&server, &QTcpServer::newConnection, &server, [&] {
            QTcpSocket *socket = server.nextPendingConnection();
            auto incoming = std::make_shared<QByteArray>();
            auto replied = std::make_shared<bool>(false);
            connect(socket, &QTcpSocket::readyRead, socket, [&, socket, incoming, replied] {
                if (*replied) return;
                incoming->append(socket->readAll());
                const int headerEnd = incoming->indexOf("\r\n\r\n");
                if (headerEnd < 0) return;
                const QByteArray headers = incoming->left(headerEnd);
                int contentLength = -1;
                for (const QByteArray &line : headers.split('\n')) {
                    if (line.toLower().startsWith("content-length:"))
                        contentLength = line.mid(line.indexOf(':') + 1).trimmed().toInt();
                }
                if (contentLength < 0 || incoming->size() - headerEnd - 4 < contentLength) return;
                *replied = true;
                lastRequest = *incoming;
                const QByteArray body = QJsonDocument(response).toJson(QJsonDocument::Compact);
                socket->write("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: "
                    + QByteArray::number(body.size()) + "\r\nConnection: close\r\n\r\n" + body);
                socket->disconnectFromHost();
            });
            connect(socket, &QTcpSocket::disconnected, socket, &QTcpSocket::deleteLater);
        });

        AfterimageImageStore store(directory.filePath("candidates"));
        AfterimageApiImages service(directory.path(), &store);
        service.setEphemeralKey("openai", "local-test-key");
        service.setEphemeralKey("gemini", "local-test-key");
        const QUrl endpoint(QString("http://127.0.0.1:%1/test").arg(server.serverPort()));
        service.setEndpointForTesting("openai", endpoint);
        service.setEndpointForTesting("gemini", endpoint);
        QSignalSpy ready(&service, &AfterimageApiImages::jobReady);
        for (const QString &provider : {QString("openai"), QString("gemini")}) {
            const QJsonObject inlineData{{"mimeType", "image/png"}, {"data", QString::fromLatin1(png.toBase64())}};
            if (provider == "openai")
                response = {{"data", QJsonArray{QJsonObject{{"b64_json", QString::fromLatin1(png.toBase64())}}}}};
            else {
                const QJsonArray parts{QJsonObject{{"thought", true}, {"inlineData", inlineData}},
                    QJsonObject{{"inlineData", inlineData}}};
                response = {{"candidates", QJsonArray{QJsonObject{{"content", QJsonObject{{"parts", parts}}}}}}};
            }
            const QString model = provider == "openai" ? "gpt-image-2.5-sunburst" : "gemini-3-pro-image";
            QString jobId;
            service.start(nullptr, {{"provider", provider}, {"model", model}, {"prompt", "A small neutral red mark"},
                {"scope", "none"}, {"intent", "addition"}}, [&](bool ok, const QJsonObject &result) {
                QVERIFY(ok);
                jobId = result.value("jobId").toString();
            });
            QVERIFY(!jobId.isEmpty());
            QJsonObject completion;
            service.wait(jobId, [&](bool ok, const QJsonObject &result) {
                QVERIFY(ok);
                completion = result;
            });
            QTRY_VERIFY_WITH_TIMEOUT(!completion.isEmpty(), 10000);
            QCOMPARE(completion.value("status").toString(), QString("retained"));
            QCOMPARE(completion.value("imageModel").toString(), model);
            QVERIFY(completion.value("hasTransparency").toBool());
            QVERIFY(!completion.value("candidateId").toString().isEmpty());
            const auto candidate = ready.last().at(0).toJsonObject();
            QVERIFY(QFileInfo::exists(candidate.value("path").toString()));
            QCOMPARE(candidate.value("requestedImageModel").toString(), model);
            QVERIFY(provider == "openai" ? lastRequest.contains(model.toUtf8())
                : lastRequest.contains("responseModalities"));
            QVERIFY(!QJsonDocument(completion).toJson().contains(png.toBase64()));
        }
        QCOMPARE(ready.size(), 2);
        QString cancelledJob;
        service.start(nullptr, {{"provider", "openai"}, {"model", "gpt-image-2.5-flare"},
            {"prompt", "A neutral drawing"}, {"scope", "none"}, {"intent", "replacement"}},
            [&](bool ok, const QJsonObject &result) { QVERIFY(ok); cancelledJob = result.value("jobId").toString(); });
        QVERIFY(!cancelledJob.isEmpty());
        service.cancel(cancelledJob, [&](bool ok, const QJsonObject &result) {
            QVERIFY(ok);
            QCOMPARE(result.value("status").toString(), QString("cancelled"));
        });
        service.wait(cancelledJob, [&](bool ok, const QJsonObject &result) {
            QVERIFY(!ok);
            QCOMPARE(result.value("status").toString(), QString("failed"));
        });
    }
};
QTEST_GUILESS_MAIN(ApiImagesTest)
#include "ApiImagesTest.moc"
