// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Offscreen, native-widget evidence for the conversation layout and scroll contract.
#include "../AfterimageDock.h"
#include "../AfterimageSession.h"
#include <QApplication>
#include <QDir>
#include <QEventLoop>
#include <QFont>
#include <QImage>
#include <QJsonArray>
#include <QJsonObject>
#include <QLabel>
#include <QMainWindow>
#include <QLayout>
#include <QPainter>
#include <QPlainTextEdit>
#include <QPushButton>
#include <QScrollBar>
#include <QTabWidget>
#include <QTextBrowser>
#include <QTimer>

static QJsonObject user(const QString &text)
{
    return {{"type", "userMessage"}, {"content", QJsonArray{QJsonObject{{"type", "text"}, {"text", text}}}}};
}

static QJsonObject assistant(const QString &text)
{
    return {{"type", "agentMessage"}, {"text", text}};
}

static bool capture(AfterimageDock &dock, const QString &path, int width, bool latest)
{
    dock.resize(width, 850);
    dock.ensurePolished();
    dock.layout()->activate();
    if (dock.widget()->layout()) dock.widget()->layout()->activate();
    QApplication::processEvents();
    auto *transcript = dock.findChild<QTextBrowser *>("AfterimageTranscript");
    if (latest) {
        transcript->verticalScrollBar()->setValue(transcript->verticalScrollBar()->maximum());
        QApplication::processEvents();
        transcript->verticalScrollBar()->setValue(transcript->verticalScrollBar()->maximum());
    }
    QImage image(dock.size(), QImage::Format_ARGB32_Premultiplied);
    image.fill(Qt::transparent);
    QPainter painter(&image);
    dock.render(&painter);
    painter.end();
    return image.save(path);
}

static void drainEvents()
{
    QEventLoop loop;
    QTimer::singleShot(100, &loop, &QEventLoop::quit);
    loop.exec();
}

int main(int argc, char **argv)
{
    QApplication application(argc, argv);
    application.setProperty("AfterimageOffscreenPreview", true);
    application.setStyle("Fusion");
    application.setFont(QFont("Segoe UI", 10));
    const QString output = argc > 1 ? QString::fromLocal8Bit(argv[1]) : QStringLiteral(".");
    if (!QDir().mkpath(output)) return 2;
    AfterimageDock dock;
    auto *session = dock.findChild<AfterimageSession *>();
    auto *transcript = dock.findChild<QTextBrowser *>("AfterimageTranscript");
    auto *composer = dock.findChild<QPlainTextEdit *>("AfterimageComposer");
    auto *status = dock.findChild<QLabel *>("AfterimageStatus");
    auto *send = dock.findChild<QPushButton *>("AfterimageSend");
    if (!session || !transcript || !composer || !status || !send) return 3;
    session->readinessChanged(true, true);
    session->modelsReceived(QJsonArray{QJsonObject{{"model", "gpt-6-sol"}, {"displayName", "GPT-6 Sol"},
        {"defaultReasoningEffort", "medium"}, {"supportedReasoningEfforts", QJsonArray{
            QJsonObject{{"reasoningEffort", "low"}}, QJsonObject{{"reasoningEffort", "medium"}},
            QJsonObject{{"reasoningEffort", "high"}}}}}});

    const QJsonArray turns{
        QJsonObject{{"items", QJsonArray{
            user("I have a rough three-panel page. The joke is that the little robot has prepared for everything except the rain. Keep the expression visible at phone size."),
            assistant("The last panel needs the robot's face and the failed umbrella in the same glance. I would keep the first two panels quiet so that reveal has room to land.\n\nI can arrange the panel frames and leave the lettering editable. Which page size are you working at?")}}},
        QJsonObject{{"items", QJsonArray{
            user("1800 × 2700. Use broad gutters. Put the punch line in a small caption below the last panel, and keep the existing painted layers."),
            assistant("I’ll add a separate vector layer for the panel borders and another for the caption. Your paint layers will stay editable. I’ll inspect the current page first, then place the frames around the existing drawing.")}}}
    };
    session->historyPageReceived(turns, false, {});
    status->setText("Working on panel layout…");
    composer->setPlainText("Make the last panel a little wider. I want the pause before the caption to feel deliberate.");
    send->setText("Send guidance");
    send->setEnabled(true);
    session->eventReceived("item/agentMessage/delta", {{"itemId", "live"}, {"delta", "I found the painted character layer. I’m placing the frames on an editable vector layer, then I’ll add the caption below panel three."}});
    drainEvents();
    auto *bar = transcript->verticalScrollBar();
    bar->setValue(bar->maximum());
    if (!capture(dock, output + "/conversation-360.png", 360, true)
        || !capture(dock, output + "/conversation-480.png", 480, true)) return 4;

    bar->setValue(qMax(0, bar->maximum() / 3));
    bar->actionTriggered(QAbstractSlider::SliderMove);
    QApplication::processEvents();
    const int readingPosition = bar->value();
    session->eventReceived("item/agentMessage/delta", {{"itemId", "live"}, {"delta", " The source stays intact and can be changed at any time."}});
    drainEvents();
    if (bar->value() != readingPosition) return 5;
    if (!capture(dock, output + "/conversation-reading.png", 360, false)) return 6;
    session->eventReceived("item/completed", {{"item", QJsonObject{{"type", "agentMessage"}, {"id", "live"},
        {"text", "I found the painted character layer. I placed the frames on a separate editable vector layer. The source art remains intact."}}}});
    drainEvents();
    if (transcript->toPlainText().count("I found the painted character layer.") != 1) return 7;
    if (!capture(dock, output + "/conversation-completed.png", 360, true)) return 8;
    auto *tabs = dock.findChild<QTabWidget *>();
    if (!tabs || tabs->count() < 2) return 9;
    tabs->setCurrentIndex(1);
    if (!capture(dock, output + "/image-api-360.png", 360, false)
        || !capture(dock, output + "/image-api-480.png", 480, false)) return 10;
    auto *apiToggle = dock.findChild<QPushButton *>("AfterimageApiToggle");
    if (!apiToggle) return 11;
    apiToggle->click();
    if (!capture(dock, output + "/image-api-form-360.png", 360, false)) return 12;
    if (argc > 2) {
        const QImage artwork(QString::fromLocal8Bit(argv[2]));
        if (artwork.isNull()) return 13;
        QMainWindow workplace;
        auto *canvas = new QLabel(&workplace);
        canvas->setAlignment(Qt::AlignCenter);
        canvas->setStyleSheet("background: #33383d;");
        canvas->setPixmap(QPixmap::fromImage(artwork).scaled(850, 700, Qt::KeepAspectRatio, Qt::SmoothTransformation));
        workplace.setCentralWidget(canvas);
        auto *rightDock = new AfterimageDock();
        rightDock->setMinimumWidth(360);
        workplace.addDockWidget(Qt::RightDockWidgetArea, rightDock);
        workplace.resize(1280, 850);
        workplace.ensurePolished();
        workplace.layout()->activate();
        QApplication::processEvents();
        rightDock->findChild<QTabWidget *>()->setCurrentIndex(1);
        QImage whole(workplace.size(), QImage::Format_ARGB32_Premultiplied);
        whole.fill(Qt::transparent);
        QPainter painter(&whole);
        workplace.render(&painter);
        painter.end();
        if (!whole.save(output + "/workplace-image-api.png")) return 14;
    }
    return 0;
}
