// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#include "TempleStudioHost.h"
#include "TempleStudioBridge.h"
#include <KisDocument.h>
#include <QCoreApplication>
#include <QDir>
#include <QEvent>
#include <QFile>
#include <QFileInfo>
#include <QJsonDocument>
#include <QJsonValue>
#include <QLabel>
#include <QMimeDatabase>
#include <QPointer>
#include <QSaveFile>
#include <QShowEvent>
#include <QStandardPaths>
#include <QUrl>
#include <QUrlQuery>
#include <QVBoxLayout>
#ifdef Q_OS_WIN
#include <windows.h>
#include <objidl.h>
#include <WebView2.h>
#include <atomic>
#include <cstring>
#endif

#ifdef Q_OS_WIN
namespace {
template<class Interface> const IID &interfaceId();
template<> const IID &interfaceId<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>() {
    return IID_ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler;
}
template<> const IID &interfaceId<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>() {
    return IID_ICoreWebView2CreateCoreWebView2ControllerCompletedHandler;
}
template<> const IID &interfaceId<ICoreWebView2WebMessageReceivedEventHandler>() {
    return IID_ICoreWebView2WebMessageReceivedEventHandler;
}
template<> const IID &interfaceId<ICoreWebView2WebResourceRequestedEventHandler>() {
    return IID_ICoreWebView2WebResourceRequestedEventHandler;
}
template<> const IID &interfaceId<ICoreWebView2ExecuteScriptCompletedHandler>() {
    return IID_ICoreWebView2ExecuteScriptCompletedHandler;
}
template<> const IID &interfaceId<ICoreWebView2CapturePreviewCompletedHandler>() {
    return IID_ICoreWebView2CapturePreviewCompletedHandler;
}
template<class Interface> class CallbackBase : public Interface {
public:
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID iid, void **result) override {
        if (!result) return E_POINTER;
        *result = nullptr;
        if (IsEqualIID(iid, IID_IUnknown) || IsEqualIID(iid, interfaceId<Interface>())) {
            *result = static_cast<Interface *>(this); AddRef(); return S_OK;
        }
        return E_NOINTERFACE;
    }
    ULONG STDMETHODCALLTYPE AddRef() override { return ++m_references; }
    ULONG STDMETHODCALLTYPE Release() override {
        const ULONG remaining = --m_references;
        if (!remaining) delete this;
        return remaining;
    }
protected:
    virtual ~CallbackBase() = default;
private:
    std::atomic<ULONG> m_references{1};
};
class EnvironmentCallback final : public CallbackBase<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler> {
public:
    explicit EnvironmentCallback(TempleStudioHost *host) : m_host(host) {}
    HRESULT STDMETHODCALLTYPE Invoke(HRESULT result, ICoreWebView2Environment *environment) override {
        if (m_host) m_host->environmentReady(result, environment);
        return S_OK;
    }
private:
    QPointer<TempleStudioHost> m_host;
};
class ControllerCallback final : public CallbackBase<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler> {
public:
    explicit ControllerCallback(TempleStudioHost *host) : m_host(host) {}
    HRESULT STDMETHODCALLTYPE Invoke(HRESULT result, ICoreWebView2Controller *controller) override {
        if (m_host) m_host->controllerReady(result, controller);
        return S_OK;
    }
private:
    QPointer<TempleStudioHost> m_host;
};
class MessageCallback final : public CallbackBase<ICoreWebView2WebMessageReceivedEventHandler> {
public:
    explicit MessageCallback(TempleStudioHost *host) : m_host(host) {}
    HRESULT STDMETHODCALLTYPE Invoke(ICoreWebView2 *, ICoreWebView2WebMessageReceivedEventArgs *arguments) override {
        if (m_host) m_host->webMessage(arguments);
        return S_OK;
    }
private:
    QPointer<TempleStudioHost> m_host;
};
class ResourceCallback final : public CallbackBase<ICoreWebView2WebResourceRequestedEventHandler> {
public:
    explicit ResourceCallback(TempleStudioHost *host) : m_host(host) {}
    HRESULT STDMETHODCALLTYPE Invoke(ICoreWebView2 *, ICoreWebView2WebResourceRequestedEventArgs *arguments) override {
        if (m_host) m_host->webResource(arguments);
        return S_OK;
    }
private:
    QPointer<TempleStudioHost> m_host;
};
class ScriptCallback final : public CallbackBase<ICoreWebView2ExecuteScriptCompletedHandler> {
public:
    explicit ScriptCallback(TempleStudioHost::InspectionDone done) : m_done(std::move(done)) {}
    HRESULT STDMETHODCALLTYPE Invoke(HRESULT result, LPCWSTR value) override {
        m_done(SUCCEEDED(result), value ? QString::fromWCharArray(value) : QString());
        return S_OK;
    }
private:
    TempleStudioHost::InspectionDone m_done;
};
class PreviewCallback final : public CallbackBase<ICoreWebView2CapturePreviewCompletedHandler> {
public:
    PreviewCallback(IStream *stream, const QString &path, TempleStudioHost::InspectionDone done)
        : m_stream(stream), m_path(path), m_done(std::move(done)) { m_stream->AddRef(); }
    ~PreviewCallback() override { m_stream->Release(); }
    HRESULT STDMETHODCALLTYPE Invoke(HRESULT result) override {
        if (FAILED(result)) { m_done(false, QStringLiteral("WebView2 could not capture the Studio.")); return S_OK; }
        STATSTG stat{}; HGLOBAL memory = nullptr;
        if (FAILED(m_stream->Stat(&stat, STATFLAG_NONAME)) || FAILED(GetHGlobalFromStream(m_stream, &memory))) {
            m_done(false, QStringLiteral("WebView2 capture bytes are unavailable.")); return S_OK;
        }
        void *bytes = GlobalLock(memory);
        QSaveFile output(m_path);
        const qint64 size = qint64(stat.cbSize.QuadPart);
        const bool saved = bytes && output.open(QIODevice::WriteOnly)
            && output.write(static_cast<const char *>(bytes), size) == size && output.commit();
        if (bytes) GlobalUnlock(memory);
        m_done(saved, saved ? m_path : QStringLiteral("Could not retain the WebView2 preview PNG."));
        return S_OK;
    }
private:
    IStream *m_stream;
    QString m_path;
    TempleStudioHost::InspectionDone m_done;
};
IStream *memoryStream(const QByteArray &bytes) {
    HGLOBAL memory = GlobalAlloc(GMEM_MOVEABLE, qMax<qsizetype>(1, bytes.size()));
    if (!memory) return nullptr;
    void *data = GlobalLock(memory);
    if (!data) { GlobalFree(memory); return nullptr; }
    if (!bytes.isEmpty()) std::memcpy(data, bytes.constData(), size_t(bytes.size()));
    GlobalUnlock(memory);
    IStream *stream = nullptr;
    if (FAILED(CreateStreamOnHGlobal(memory, TRUE, &stream))) { GlobalFree(memory); return nullptr; }
    return stream;
}
QString wideString(LPWSTR text) {
    const QString value = text ? QString::fromWCharArray(text) : QString();
    CoTaskMemFree(text);
    return value;
}
}
#endif

TempleStudioHost::TempleStudioHost(KisDocument *document, const QJsonObject &initialRecipe, QWidget *parent)
    : QMainWindow(parent, Qt::Window | Qt::WindowMinMaxButtonsHint | Qt::WindowCloseButtonHint), m_document(document)
{
    setObjectName(QStringLiteral("AfterimageTempleFullStudio"));
    setWindowTitle(tr("Glitch Temple Studio · Afterimage"));
    setAttribute(Qt::WA_DeleteOnClose);
    resize(1280, 850);
    auto *body = new QWidget(this);
    auto *layout = new QVBoxLayout(body);
    layout->setContentsMargins(0, 0, 0, 0);
    m_surface = new QWidget(body);
    m_surface->setAttribute(Qt::WA_NativeWindow);
    m_surface->installEventFilter(this);
    layout->addWidget(m_surface, 1);
    m_message = new QLabel(tr("Opening the bound Temple Studio…"), m_surface);
    m_message->setAlignment(Qt::AlignCenter);
    m_message->setGeometry(m_surface->rect());
    setCentralWidget(body);
    m_bridge = new TempleStudioBridge(document, initialRecipe, this);
    connect(m_bridge, &TempleStudioBridge::recipeChanged, this, &TempleStudioHost::recipeChanged);
}

TempleStudioHost::~TempleStudioHost() {
#ifdef Q_OS_WIN
    if (m_controller) { m_controller->Close(); m_controller->Release(); }
    if (m_webview) m_webview->Release();
    if (m_environment) m_environment->Release();
    if (m_loader) FreeLibrary(static_cast<HMODULE>(m_loader));
    if (m_comInitialized) CoUninitialize();
#endif
}

void TempleStudioHost::report(const QString &message) { if (m_message) m_message->setText(message); }
QString TempleStudioHost::statusText() const { return m_message ? m_message->text() : QString(); }
void TempleStudioHost::showEvent(QShowEvent *event) {
    QMainWindow::showEvent(event);
    if (!m_started) start();
}
bool TempleStudioHost::eventFilter(QObject *object, QEvent *event) {
    if (object == m_surface && event->type() == QEvent::Resize) {
        if (m_message) m_message->setGeometry(m_surface->rect());
#ifdef Q_OS_WIN
        resizeController();
#endif
    }
    return QMainWindow::eventFilter(object, event);
}
void TempleStudioHost::start() {
    m_started = true;
#ifdef Q_OS_WIN
    const HRESULT com = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
    if (FAILED(com)) { report(tr("WebView2 needs a single-threaded UI apartment (%1).")
        .arg(uint(com), 8, 16, QChar('0'))); return; }
    m_comInitialized = true;
    const QString loader = qEnvironmentVariable("AFTERIMAGE_TEMPLE_WEBVIEW2_LOADER",
        QCoreApplication::applicationDirPath() + QStringLiteral("/WebView2Loader.dll"));
    m_loader = LoadLibraryW(reinterpret_cast<LPCWSTR>(loader.utf16()));
    if (!m_loader) { report(tr("The app-owned WebView2 loader could not load (%1).")
        .arg(GetLastError())); return; }
    using CreateEnvironment = HRESULT (STDAPICALLTYPE *)(PCWSTR, PCWSTR, ICoreWebView2EnvironmentOptions *,
        ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler *);
    auto create = reinterpret_cast<CreateEnvironment>(GetProcAddress(static_cast<HMODULE>(m_loader),
        "CreateCoreWebView2EnvironmentWithOptions"));
    if (!create) { report(tr("The WebView2 loader has no environment entry point (%1).")
        .arg(GetLastError())); return; }
    const QString profile = QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation)
        + QStringLiteral("/temple/webview-profile");
    QDir().mkpath(profile);
    auto *callback = new EnvironmentCallback(this);
    const HRESULT result = create(nullptr, reinterpret_cast<LPCWSTR>(profile.utf16()), nullptr, callback);
    callback->Release();
    if (FAILED(result)) report(tr("The WebView2 runtime could not start (%1).").arg(uint(result), 8, 16, QChar('0')));
#else
    report(tr("The full Temple Studio is available on Windows."));
#endif
}

#ifdef Q_OS_WIN
void TempleStudioHost::environmentReady(long result, ICoreWebView2Environment *environment) {
    if (FAILED(result) || !environment) {
        report(tr("The WebView2 runtime could not initialize (%1).")
            .arg(uint(result), 8, 16, QChar('0'))); return;
    }
    m_environment = environment; m_environment->AddRef();
    const HWND nativeSurface = reinterpret_cast<HWND>(m_surface->winId());
    DWORD ownerProcess = 0;
    const DWORD ownerThread = GetWindowThreadProcessId(nativeSurface, &ownerProcess);
    m_controllerContext = QStringLiteral("HWND valid=%1, visible=%2, owner PID=%3, thread=%4, current thread=%5")
        .arg(IsWindow(nativeSurface) != FALSE).arg(IsWindowVisible(nativeSurface) != FALSE)
        .arg(ownerProcess).arg(ownerThread).arg(GetCurrentThreadId());
    auto *callback = new ControllerCallback(this);
    const HRESULT status = environment->CreateCoreWebView2Controller(nativeSurface, callback);
    callback->Release();
    if (FAILED(status)) report(tr("Temple Studio could not attach WebView2 to its native surface (%1).")
        .arg(uint(status), 8, 16, QChar('0')));
}
void TempleStudioHost::controllerReady(long result, ICoreWebView2Controller *controller) {
    if (FAILED(result) || !controller) {
        report(tr("Temple Studio could not create its WebView2 controller (%1; %2).")
            .arg(uint(result), 8, 16, QChar('0')).arg(m_controllerContext)); return;
    }
    m_controller = controller; m_controller->AddRef();
    const HRESULT viewStatus = controller->get_CoreWebView2(&m_webview);
    if (FAILED(viewStatus) || !m_webview) {
        report(tr("Temple Studio could not create its web view (%1).")
            .arg(uint(viewStatus), 8, 16, QChar('0'))); return;
    }
    resizeController();
    ICoreWebView2Settings *settings = nullptr;
    if (SUCCEEDED(m_webview->get_Settings(&settings)) && settings) {
        settings->put_IsWebMessageEnabled(TRUE);
        settings->put_AreDevToolsEnabled(FALSE);
        settings->Release();
    }
    auto *messages = new MessageCallback(this);
    EventRegistrationToken messageToken{};
    m_webview->add_WebMessageReceived(messages, &messageToken);
    messages->Release();
    auto *resources = new ResourceCallback(this);
    EventRegistrationToken resourceToken{};
    m_webview->AddWebResourceRequestedFilter(L"https://studio.afterimage.local/native/*", COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL);
    m_webview->AddWebResourceRequestedFilter(L"https://studio.afterimage.local/assets*", COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL);
    m_webview->add_WebResourceRequested(resources, &resourceToken);
    resources->Release();
    const QString local = qEnvironmentVariable("AFTERIMAGE_TEMPLE_STUDIO_DIR",
        QCoreApplication::applicationDirPath() + QStringLiteral("/temple-studio"));
    if (!QFileInfo::exists(local + QStringLiteral("/index.html"))) {
        report(tr("The Glitch Temple Studio web assets are missing at %1.").arg(local)); return;
    }
    ICoreWebView2_3 *mapping = nullptr;
    const HRESULT mappingInterface = m_webview->QueryInterface(IID_ICoreWebView2_3,
        reinterpret_cast<void **>(&mapping));
    if (FAILED(mappingInterface)) {
        report(tr("This WebView2 runtime cannot map the Studio assets (%1).")
            .arg(uint(mappingInterface), 8, 16, QChar('0'))); return;
    }
    const HRESULT mapped = mapping->SetVirtualHostNameToFolderMapping(L"studio.afterimage.local",
        reinterpret_cast<LPCWSTR>(local.utf16()), COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_DENY_CORS);
    mapping->Release();
    if (FAILED(mapped)) { report(tr("Temple Studio could not map its local assets (%1).")
        .arg(uint(mapped), 8, 16, QChar('0'))); return; }
    if (m_message) m_message->hide();
    const HRESULT navigated = m_webview->Navigate(L"https://studio.afterimage.local/index.html");
    if (FAILED(navigated)) report(tr("Temple Studio could not open its local page (%1).")
        .arg(uint(navigated), 8, 16, QChar('0')));
}
void TempleStudioHost::resizeController() {
    if (!m_controller || !m_surface) return;
    const QRect bounds = m_surface->rect();
    RECT rectangle{bounds.left(), bounds.top(), bounds.right() + 1, bounds.bottom() + 1};
    m_controller->put_Bounds(rectangle);
}
void TempleStudioHost::webMessage(ICoreWebView2WebMessageReceivedEventArgs *arguments) {
    LPWSTR source = nullptr;
    if (FAILED(arguments->get_Source(&source))) return;
    const QString origin = wideString(source);
    if (!origin.startsWith(QStringLiteral("https://studio.afterimage.local/"))) return;
    LPWSTR json = nullptr;
    if (FAILED(arguments->get_WebMessageAsJson(&json))) return;
    const QJsonObject message = QJsonDocument::fromJson(wideString(json).toUtf8()).object();
    if (message["kind"] != QStringLiteral("invoke")) return;
    const int id = message["id"].toInt(-1);
    if (id < 0) return;
    m_bridge->invoke(message["command"].toString(), message["args"].toObject(),
        [this, id](bool ok, const QJsonValue &value, const QString &error) { reply(id, ok, value, error); });
}
void TempleStudioHost::webResource(ICoreWebView2WebResourceRequestedEventArgs *arguments) {
    ICoreWebView2WebResourceRequest *request = nullptr;
    if (FAILED(arguments->get_Request(&request)) || !request) return;
    LPWSTR rawUrl = nullptr, rawMethod = nullptr;
    request->get_Uri(&rawUrl); request->get_Method(&rawMethod);
    const QUrl url(wideString(rawUrl));
    const QString method = wideString(rawMethod);
    int code = 404;
    QString contentType = QStringLiteral("text/plain; charset=utf-8");
    QByteArray body = "No Temple asset at this path.";
    if (url.host() == QStringLiteral("studio.afterimage.local")
        && url.path() == QStringLiteral("/native/upload") && method == QStringLiteral("POST")) {
        IStream *stream = nullptr;
        if (SUCCEEDED(request->get_Content(&stream)) && stream) {
            const QString name = QUrlQuery(url).queryItemValue(QStringLiteral("name"), QUrl::FullyDecoded);
            QString error;
            const QJsonObject result = m_bridge->importStream(stream, name, &error);
            stream->Release();
            code = error.isEmpty() ? 200 : 400;
            contentType = QStringLiteral("application/json; charset=utf-8");
            body = error.isEmpty() ? QJsonDocument(result).toJson(QJsonDocument::Compact)
                : QJsonDocument(QJsonObject{{"error", error}}).toJson(QJsonDocument::Compact);
        }
    } else if (url.host() == QStringLiteral("studio.afterimage.local")
               && url.path() == QStringLiteral("/assets") && method == QStringLiteral("GET")) {
        const QString path = QUrlQuery(url).queryItemValue(QStringLiteral("path"), QUrl::FullyDecoded);
        const QString readable = m_bridge->readableAsset(path);
        QFile file(readable);
        if (!readable.isEmpty() && file.open(QIODevice::ReadOnly)) {
            body = file.readAll(); code = 200;
            contentType = QMimeDatabase().mimeTypeForFile(readable).name();
        }
    }
    IStream *stream = memoryStream(body);
    ICoreWebView2WebResourceResponse *response = nullptr;
    const QString headers = QStringLiteral("Content-Type: %1\r\nCache-Control: no-store").arg(contentType);
    if (SUCCEEDED(m_environment->CreateWebResourceResponse(stream, code, code == 200 ? L"OK" : L"Unavailable",
        reinterpret_cast<LPCWSTR>(headers.utf16()), &response)) && response) {
        arguments->put_Response(response);
        response->Release();
    }
    if (stream) stream->Release();
    request->Release();
}
#endif

void TempleStudioHost::reply(int id, bool ok, const QJsonValue &value, const QString &error) {
#ifdef Q_OS_WIN
    if (!m_webview) return;
    const QJsonObject envelope{{"kind", "reply"}, {"id", id}, {"ok", ok}, {"value", value}, {"error", error}};
    const QString json = QString::fromUtf8(QJsonDocument(envelope).toJson(QJsonDocument::Compact));
    m_webview->PostWebMessageAsJson(reinterpret_cast<LPCWSTR>(json.utf16()));
#else
    Q_UNUSED(id); Q_UNUSED(ok); Q_UNUSED(value); Q_UNUSED(error);
#endif
}
void TempleStudioHost::sendEvent(const QString &name, const QJsonObject &payload) {
#ifdef Q_OS_WIN
    if (!m_webview) return;
    const QString json = QString::fromUtf8(QJsonDocument(QJsonObject{{"kind", "event"}, {"name", name},
        {"payload", payload}}).toJson(QJsonDocument::Compact));
    m_webview->PostWebMessageAsJson(reinterpret_cast<LPCWSTR>(json.utf16()));
#else
    Q_UNUSED(name); Q_UNUSED(payload);
#endif
}
void TempleStudioHost::evaluateScript(const QString &script, InspectionDone done) {
#ifdef Q_OS_WIN
    if (!m_webview) { done(false, QStringLiteral("The Studio web view is not ready.")); return; }
    auto failure = done;
    auto *callback = new ScriptCallback(std::move(done));
    const HRESULT result = m_webview->ExecuteScript(reinterpret_cast<LPCWSTR>(script.utf16()), callback);
    callback->Release();
    if (FAILED(result)) failure(false, QStringLiteral("The Studio could not evaluate its current state."));
#else
    Q_UNUSED(script); done(false, QStringLiteral("WebView2 is only available on Windows."));
#endif
}
void TempleStudioHost::capturePreview(const QString &pngPath, InspectionDone done) {
#ifdef Q_OS_WIN
    if (!m_webview) { done(false, QStringLiteral("The Studio web view is not ready.")); return; }
    IStream *stream = memoryStream({});
    if (!stream) { done(false, QStringLiteral("Could not allocate the Studio capture stream.")); return; }
    auto failure = done;
    auto *callback = new PreviewCallback(stream, pngPath, std::move(done));
    const HRESULT result = m_webview->CapturePreview(COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG,
        stream, callback);
    callback->Release(); stream->Release();
    if (FAILED(result)) failure(false, QStringLiteral("The Studio preview could not be captured."));
#else
    Q_UNUSED(pngPath); done(false, QStringLiteral("WebView2 is only available on Windows."));
#endif
}
