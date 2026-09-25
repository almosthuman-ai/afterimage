// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#include "ComicProject.h"
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QSaveFile>
#include <QSet>

QString ComicProject::manifestName() { return QStringLiteral(".afterimage-comic.json"); }

QStringList ComicProject::pages(const QString &folder)
{
    const QDir directory(folder);
    if (!directory.exists()) return {};
    QStringList found;
    for (const QFileInfo &entry : directory.entryInfoList({"*.kra"}, QDir::Files, QDir::Name))
        found.append(entry.fileName());
    QSet<QString> remaining;
    for (const QString &name : found) remaining.insert(name.toCaseFolded());
    QFile file(directory.filePath(manifestName()));
    QStringList result;
    if (file.open(QIODevice::ReadOnly)) {
        const QJsonObject object = QJsonDocument::fromJson(file.readAll()).object();
        if (object["version"].toInt() == 1) {
            for (const QJsonValue &value : object["pages"].toArray()) {
                const QString requested = value.toString();
                for (const QString &actual : found) {
                    if (actual.compare(requested, Qt::CaseInsensitive) == 0 && remaining.remove(actual.toCaseFolded())) {
                        result.append(actual);
                        break;
                    }
                }
            }
        }
    }
    for (const QString &name : found) if (remaining.remove(name.toCaseFolded())) result.append(name);
    return result;
}

bool ComicProject::saveOrder(const QString &folder, const QStringList &names, QString *error)
{
    const QDir directory(folder);
    if (!directory.exists()) { if (error) *error = QStringLiteral("The comic folder does not exist."); return false; }
    const QStringList discovered = pages(folder);
    if (discovered.size() != names.size()) {
        if (error) *error = QStringLiteral("The page list changed. Refresh it before saving the order.");
        return false;
    }
    QSet<QString> expected, proposed;
    for (const QString &name : discovered) expected.insert(name.toCaseFolded());
    for (const QString &name : names) {
        if (QFileInfo(name).fileName() != name || !name.endsWith(".kra", Qt::CaseInsensitive)) {
            if (error) *error = QStringLiteral("Page names must be local KRA filenames.");
            return false;
        }
        proposed.insert(name.toCaseFolded());
    }
    if (expected != proposed || proposed.size() != names.size()) {
        if (error) *error = QStringLiteral("The order must contain every saved page exactly once.");
        return false;
    }
    QJsonArray array;
    for (const QString &name : names) array.append(name);
    QSaveFile file(directory.filePath(manifestName()));
    const QByteArray serialized = QJsonDocument(QJsonObject{{"version", 1}, {"pages", array}}).toJson(QJsonDocument::Indented);
    if (!file.open(QIODevice::WriteOnly) || file.write(serialized) != serialized.size() || !file.commit()) {
        if (error) *error = QStringLiteral("The page order could not be saved.");
        return false;
    }
    return true;
}

bool ComicProject::appendPage(const QString &folder, const QString &fileName, QString *error)
{
    QStringList ordered = pages(folder);
    if (!ordered.contains(fileName, Qt::CaseInsensitive)) {
        if (error) *error = QStringLiteral("Save the KRA page inside this comic folder first.");
        return false;
    }
    return saveOrder(folder, ordered, error);
}
