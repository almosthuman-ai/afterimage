// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#include "AfterimageImageStore.h"
#include <QDateTime>
#include <QDir>
#include <QFile>
#include <QFutureWatcher>
#include <QImage>
#include <QJsonDocument>
#include <QSaveFile>
#include <QUuid>
#include <QtConcurrentRun>

namespace {
bool saveBytes(const QString &path, const QByteArray &bytes)
{
    QSaveFile file(path);
    return file.open(QIODevice::WriteOnly) && file.write(bytes) == bytes.size() && file.commit();
}
QJsonObject retainArtifact(const QString &root, const QJsonObject &artifact, QJsonObject provenance)
{
    QByteArray bytes;
    QFile input(artifact["savedPath"].toString());
    if (!input.fileName().isEmpty() && input.open(QIODevice::ReadOnly)) bytes = input.readAll();
    else {
        QByteArray encoded = artifact["result"].toString().toUtf8();
        if (encoded.startsWith("data:")) encoded = encoded.mid(encoded.indexOf(',') + 1);
        bytes = QByteArray::fromBase64(encoded);
    }
    QImage image;
    if (!image.loadFromData(bytes)) return {{"error", "The generator returned no readable image."}};
    const QString id = QUuid::createUuid().toString(QUuid::WithoutBraces);
    const QString folder = root + '/' + id;
    if (!QDir().mkpath(folder) || !saveBytes(folder + "/provider-original", bytes) || !image.save(folder + "/image.png"))
        return {{"error", "The generated image could not be saved."}};
    // Candidate decoding and thumbnail creation happen off the UI thread.
    image.scaled(112, 112, Qt::KeepAspectRatio, Qt::SmoothTransformation).save(folder + "/thumbnail.png");
    provenance["id"] = id;
    provenance["created"] = QDateTime::currentDateTimeUtc().toString(Qt::ISODate);
    provenance["width"] = image.width();
    provenance["height"] = image.height();
    provenance["hasAlpha"] = image.hasAlphaChannel();
    bool hasTransparency = false;
    if (image.hasAlphaChannel()) {
        for (int y = 0; y < image.height() && !hasTransparency; ++y)
            for (int x = 0; x < image.width(); ++x)
                if (qAlpha(image.pixel(x, y)) < 255) { hasTransparency = true; break; }
    }
    provenance["hasTransparency"] = hasTransparency;
    provenance["path"] = QString(folder + "/image.png");
    auto source = provenance.value("source").toObject();
    auto prepared = source.value("preparedSource").toObject();
    const QString inputPath = prepared.value("previewPath").toString();
    const QString maskPath = prepared.value("maskPath").toString();
    if (!maskPath.isEmpty()) {
        const QString retainedMask = folder + "/selection.mask";
        if (!QFile::copy(maskPath, retainedMask))
            return {{"error", "The generated image was saved, but its selection mask could not be retained."}};
        prepared["maskPath"] = retainedMask;
    }
    if (!inputPath.isEmpty()) {
        const QString retainedSource = folder + "/source.png";
        if (!QFile::copy(inputPath, retainedSource))
            return {{"error", "The generated image was saved, but its source preview could not be retained."}};
        prepared["previewPath"] = retainedSource;
    }
    if (!prepared.isEmpty()) source["preparedSource"] = prepared;
    if (!source.isEmpty()) provenance["source"] = source;
    if (!saveBytes(folder + "/candidate.json", QJsonDocument(provenance).toJson()))
        return {{"error", "The image was saved, but its source details could not be written."}, {"path", QString(folder + "/image.png")}};
    return provenance;
}
}

AfterimageImageStore::AfterimageImageStore(const QString &root, QObject *parent) : QObject(parent), m_root(root) {}

void AfterimageImageStore::retain(const QJsonObject &artifact, const QJsonObject &provenance)
{
    auto *watcher = new QFutureWatcher<QJsonObject>(this);
    const QString itemId = provenance["itemId"].toString();
    connect(watcher, &QFutureWatcher<QJsonObject>::finished, this, [this, watcher, itemId] {
        const QJsonObject result = watcher->result();
        watcher->deleteLater();
        if (result.contains("error")) {
            Q_EMIT failedForItem(itemId, result["error"].toString());
            Q_EMIT failed(result["error"].toString());
        }
        else Q_EMIT retained(result);
    });
    watcher->setFuture(QtConcurrent::run(retainArtifact, m_root, artifact, provenance));
}
