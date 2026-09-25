// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include <QMainWindow>
#include <QJsonObject>
#include <QPointer>
#include <functional>

class KisDocument;
class TempleStudioBridge;
class QWidget;
class QLabel;
#ifdef Q_OS_WIN
struct ICoreWebView2Environment;
struct ICoreWebView2Controller;
struct ICoreWebView2;
struct ICoreWebView2WebMessageReceivedEventArgs;
struct ICoreWebView2WebResourceRequestedEventArgs;
#endif

// Created and shown only after the artist presses Open full Studio. Its bound
// document never follows active-tab changes. Closing the window leaves native
// rendering, agent operations and any in-flight owned service work intact.
class TempleStudioHost : public QMainWindow
{
    Q_OBJECT
public:
    TempleStudioHost(KisDocument *document, const QJsonObject &initialRecipe, QWidget *parent = nullptr);
    ~TempleStudioHost() override;
    void sendEvent(const QString &name, const QJsonObject &payload = {});
    using InspectionDone = std::function<void(bool, const QString &)>;
    void evaluateScript(const QString &script, InspectionDone done);
    void capturePreview(const QString &pngPath, InspectionDone done);
    QString statusText() const;
Q_SIGNALS:
    void recipeChanged(const QJsonObject &recipe);
protected:
    void showEvent(QShowEvent *event) override;
    bool eventFilter(QObject *object, QEvent *event) override;
private:
    void start();
    void report(const QString &message);
    void reply(int id, bool ok, const QJsonValue &value, const QString &error = {});
#ifdef Q_OS_WIN
public: // Invoked by COM callbacks; no active-window or active-document lookup.
    void environmentReady(long result, ICoreWebView2Environment *environment);
    void controllerReady(long result, ICoreWebView2Controller *controller);
    void webMessage(ICoreWebView2WebMessageReceivedEventArgs *arguments);
    void webResource(ICoreWebView2WebResourceRequestedEventArgs *arguments);
private:
    void resizeController();
    ICoreWebView2Environment *m_environment = nullptr;
    ICoreWebView2Controller *m_controller = nullptr;
    ICoreWebView2 *m_webview = nullptr;
    void *m_loader = nullptr;
    bool m_comInitialized = false;
    QString m_controllerContext;
#endif
    QWidget *m_surface = nullptr;
    QLabel *m_message = nullptr;
    QPointer<KisDocument> m_document;
    TempleStudioBridge *m_bridge = nullptr;
    bool m_started = false;
};
