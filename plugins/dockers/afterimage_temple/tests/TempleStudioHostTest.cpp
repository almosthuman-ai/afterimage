// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#include "../TempleStudioHost.h"
#include "../TempleRecipe.h"
#include "../TempleService.h"
#include <KisDocument.h>
#include <KisPart.h>
#include <KoColor.h>
#include <KoColorSpaceRegistry.h>
#include <QElapsedTimer>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QImage>
#include <QScopedPointer>
#include <QStandardPaths>
#include <QTemporaryDir>
#include <QThread>
#include <QTimer>
#include <kis_group_layer.h>
#include <kis_image.h>
#include <testui.h>
#include <windows.h>

namespace {
class RegisteredDocument {
public:
    explicit RegisteredDocument(KisDocument *document) : m_document(document) {
        KisPart::instance()->addDocument(document, false);
    }
    ~RegisteredDocument() { KisPart::instance()->removeDocument(m_document, false); }
private:
    KisDocument *m_document;
};
QString evaluate(TempleStudioHost *studio, const QString &script, int timeoutMs = 10000) {
    bool done = false;
    QString result;
    studio->evaluateScript(script, [&](bool ok, const QString &value) {
        result = ok ? value : QStringLiteral("ERROR: ") + value;
        done = true;
    });
    QElapsedTimer clock; clock.start();
    while (!done && clock.elapsed() < timeoutMs) QTest::qWait(40);
    return done ? result : QStringLiteral("ERROR: WebView2 script timed out");
}
bool capture(TempleStudioHost *studio, const QString &path) {
    bool done = false, success = false;
    studio->capturePreview(path, [&](bool ok, const QString &) { success = ok; done = true; });
    QElapsedTimer clock; clock.start();
    while (!done && clock.elapsed() < 20000) QTest::qWait(40);
    return done && success;
}
}

class TempleStudioHostTest : public QObject {
    Q_OBJECT
private Q_SLOTS:
    void hostedFormApply() {
        QTemporaryDir directory;
        QVERIFY(directory.isValid());
        QScopedPointer<KisDocument> document(KisPart::instance()->createDocument());
        document->setFileBatchMode(true);
        QVERIFY(document->newImage("Hosted Temple Studio", 320, 240, KoColorSpaceRegistry::instance()->rgb8(),
            KoColor(QColor("#223657"), KoColorSpaceRegistry::instance()->rgb8()), KisConfig::RASTER_LAYER, 2, "", 96));
        RegisteredDocument registered(document.data());
        const int before = document->image()->rootLayer()->childCount();
        QScopedPointer<TempleStudioHost> studio(new TempleStudioHost(document.data(), TempleRecipe::initial()));
        studio->setAttribute(Qt::WA_DeleteOnClose, false);
        studio->resize(1440, 900);
        studio->show(); // The test thread is attached only to its private, never-switched desktop.
        QElapsedTimer ready; ready.start();
        QString state;
        do {
            state = evaluate(studio.data(), QStringLiteral("document.querySelector('.temple-shell')?.textContent?.slice(0,100) || ''"), 2000);
            if (state.contains(QStringLiteral("Glitch Temple"))) break;
            QTest::qWait(250);
        } while (ready.elapsed() < 30000);
        QVERIFY2(state.contains(QStringLiteral("Glitch Temple")), qPrintable(state + QStringLiteral(" / ") + studio->statusText()));
        const QString clicked = evaluate(studio.data(), QStringLiteral("document.querySelector('nav .primary-mode')?.click(); 'Form selected'"));
        QVERIFY2(clicked.contains(QStringLiteral("Form selected")), qPrintable(clicked));
        QElapsedTimer selected; selected.start();
        do {
            state = evaluate(studio.data(), QStringLiteral("document.querySelector('nav .primary-mode.selected')?.textContent || ''"), 2000);
            if (state.contains(QStringLiteral("Form"))) break;
            QTest::qWait(250);
        } while (selected.elapsed() < 10000);
        QVERIFY2(state.contains(QStringLiteral("Form")), qPrintable(state));
        const QString proof = qEnvironmentVariable("AFTERIMAGE_TEMPLE_PROOF_DIR", directory.path());
        QVERIFY(QDir().mkpath(proof));
        const QString png = QDir(proof).filePath(QStringLiteral("studio-host-form.png"));
        QVERIFY(capture(studio.data(), png));
        const QImage visibleStudio(png);
        QVERIFY(!visibleStudio.isNull());
        QVERIFY(visibleStudio.width() >= 1080);
        QVERIFY(visibleStudio.height() >= 700);
        const QString applyClick = evaluate(studio.data(), QStringLiteral(
            "Array.from(document.querySelectorAll('button')).find(button => button.textContent?.includes('Apply to Afterimage layer'))?.click(); 'Apply requested'"));
        QVERIFY2(applyClick.contains(QStringLiteral("Apply requested")), qPrintable(applyClick));
        QTRY_COMPARE_WITH_TIMEOUT(document->image()->rootLayer()->childCount(), before + 1, 120000);
        document->image()->waitForDone();
        const QString id = TempleService::instance()->documentId(document.data());
        QJsonObject preserved;
        QTRY_VERIFY_WITH_TIMEOUT(([&] {
            for (KisNodeSP node = document->image()->rootLayer()->firstChild(); node; node = node->nextSibling()) {
                const QString layerId = node->uuid().toString(QUuid::WithoutBraces);
                preserved = TempleService::instance()->recipeForLayer(id, layerId);
                if (!preserved.isEmpty()) return true;
            }
            return false;
        })(), 30000);
        QCOMPARE(preserved["processStage"].toString(), QStringLiteral("form"));
        const QString kra = QDir(proof).filePath(QStringLiteral("studio-host-form.kra"));
        QVERIFY(document->exportDocumentSync(kra, "application/x-krita"));
        qInfo() << "Private WebView2 Studio proof" << png << kra;
        studio.reset();
    }
};

int main(int argc, char **argv) {
    const QString expectedDesktop = qEnvironmentVariable("AFTERIMAGE_TEMPLE_PRIVATE_DESKTOP_NAME");
    wchar_t currentDesktop[256]{};
    DWORD desktopBytes = 0;
    if (expectedDesktop.isEmpty() || !GetUserObjectInformationW(GetThreadDesktop(GetCurrentThreadId()),
        UOI_NAME, currentDesktop, sizeof(currentDesktop), &desktopBytes)
        || expectedDesktop != QString::fromWCharArray(currentDesktop)) return 2;
    // The wrapper starts this entire process tree on a never-switched private
    // desktop. Qt needs a real HWND for WebView2, but Frank's desktop is untouched.
    qputenv("QT_QPA_PLATFORM", "windows");
    qputenv("LANGUAGE", "en");
    QLocale::setDefault(QLocale(QLocale::English, QLocale::UnitedStates));
    qputenv("EXTRA_RESOURCE_DIRS", QByteArray(KRITA_RESOURCE_DIRS_FOR_TESTS));
    qputenv("KRITA_PLUGIN_PATH", QByteArray(KRITA_PLUGINS_DIR_FOR_TESTS));
    KisSynchronizedConnectionBase::setAutoModeForUnittestsEnabled(true);
    QStandardPaths::setTestModeEnabled(true);
    QApplication app(argc, argv);
    app.setAttribute(Qt::AA_Use96Dpi, true);
    registerResources();
    TempleStudioHostTest test;
    return QTest::qExec(&test, argc, argv);
}
#include "TempleStudioHostTest.moc"
