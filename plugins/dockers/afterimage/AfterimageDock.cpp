// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#include "AfterimageDock.h"
#include "AfterimageSession.h"
#include "AfterimageImageStore.h"
#include "AfterimageDocumentBridge.h"
#include "AfterimageApiImages.h"
#include "AfterimageCompositorImport.h"
#include <QComboBox>
#include <QCheckBox>
#include <QApplication>
#include <QColor>
#include <QDialog>
#include <QDialogButtonBox>
#include <QFutureWatcher>
#include <QtConcurrentRun>
#include <QDateTime>
#include <QDesktopServices>
#include <QDir>
#include <QFileDialog>
#include <QJsonDocument>
#include <QImageReader>
#include <QLocale>
#include <QLabel>
#include <QLineEdit>
#include <QGroupBox>
#include <QScrollArea>
#include <QListWidget>
#include <QMenu>
#include <QPlainTextEdit>
#include <QPushButton>
#include <QSaveFile>
#include <QScrollBar>
#include <QSettings>
#include <QTabWidget>
#include <QTextBrowser>
#include <QTextBlockFormat>
#include <QTextCharFormat>
#include <QTextCursor>
#include <QTextDocument>
#include <QTextTable>
#include <QTimer>
#include <QVBoxLayout>
#include <QUuid>
#include <QUrl>
#include <KisDocument.h>
#include <KisPart.h>
#include <KisMainWindow.h>
#include <KisViewManager.h>
#include <kis_image.h>
#include <kis_group_layer.h>
#include <kis_layer.h>
#include <kis_selection.h>
#include <kis_import_catcher.h>

namespace {
QPushButton *button(const QString &text, QWidget *parent)
{
    auto *result = new QPushButton(text, parent);
    result->setMinimumSize(32, 32);
    return result;
}
QJsonArray tools()
{
    return AfterimageDocumentBridge::tools();
}
QString markup(const QString &text)
{
    QTextDocument document;
    // Provider text may contain Markdown, but its embedded HTML must never become UI markup.
    document.setMarkdown(text, QTextDocument::MarkdownFeatures(
        int(QTextDocument::MarkdownDialectGitHub) | int(QTextDocument::MarkdownNoHTML)));
    const QString html = document.toHtml();
    const int body = html.indexOf("<body");
    return html.mid(html.indexOf('>', body) + 1).section("</body>", 0, 0);
}
void insertBubble(QTextCursor &cursor, const QString &role, const QString &message)
{
    const bool user = role == QObject::tr("You");
    const bool assistant = role == QObject::tr("ChatGPT");
    QTextTableFormat format;
    format.setAlignment(user ? Qt::AlignRight : Qt::AlignLeft);
    format.setWidth(QTextLength(QTextLength::PercentageLength, user ? 82 : assistant ? 91 : 100));
    format.setBackground(QColor(user ? "#304b68" : assistant ? "#29313b" : "#303238"));
    format.setBorder(0);
    format.setCellPadding(8);
    format.setCellSpacing(0);
    QTextTable *table = cursor.insertTable(1, 1, format);
    QTextCursor cell = table->cellAt(0, 0).firstCursorPosition();
    QTextCharFormat heading;
    heading.setForeground(QColor("#afbfcd"));
    heading.setFontPointSize(9);
    cell.insertText(role, heading);
    QTextBlockFormat labelBlock;
    labelBlock.setTopMargin(0);
    labelBlock.setBottomMargin(2);
    cell.setBlockFormat(labelBlock);
    cell.insertBlock();
    cell.insertHtml(markup(message));
    // lastCursorPosition() still belongs to the final cell. Move past the
    // frame marker before adding the next message, or tables nest inside one
    // another and the whole conversation gradually narrows.
    cursor.setPosition(table->lastPosition() + 1);
    cursor.insertBlock();
}
}

AfterimageDock::AfterimageDock() : QDockWidget(tr("Afterimage")), m_session(new AfterimageSession(this))
{
    setProperty("ShowOnWelcomePage", true);
    m_images = new AfterimageImageStore(m_session->workspace() + "/candidates", this);
    m_documents = new AfterimageDocumentBridge(m_session->workspace(), this);
    m_apiImages = new AfterimageApiImages(m_session->workspace(), m_images, this);
    m_documents->setApiImages(m_apiImages);
    auto *body = new QWidget(this);
    auto *layout = new QVBoxLayout(body);
    layout->setContentsMargins(8, 8, 8, 8);
    auto *toolbar = new QHBoxLayout;
    m_newChat = button(tr("New chat"), body);
    m_signIn = button(tr("Sign in"), body);
    auto *menuButton = button(tr("Afterimage ▾"), body);
    auto *menu = new QMenu(menuButton);
    menuButton->setMenu(menu);
    menu->addAction(tr("Reconnect"), m_session, &AfterimageSession::reconnectServer);
    menu->addAction(tr("Refresh conversations"), this, [this] { m_session->listThreads(); });
    menu->addAction(tr("Sign out"), m_session, &AfterimageSession::signOut);
    m_defaultAction = menu->addAction(tr("Use selected model as default"));
    menu->addSeparator();
    menu->addAction(tr("Import Compositor artwork…"), this, [this] {
        const QString path = QFileDialog::getOpenFileName(this, tr("Import Compositor artwork"), {}, tr("Compositor document (*.compwin)"));
        if (path.isEmpty()) return;
        m_status->setText(tr("Importing artwork…"));
        auto *importer = new AfterimageCompositorImport(this);
        importer->load(path, [this, importer](KisDocument *document, const QString &message) {
            importer->deleteLater();
            m_status->setText(message);
            if (!document) return;
            KisPart::instance()->addDocument(document);
            if (auto *window = qobject_cast<KisMainWindow *>(this->window())) window->addViewAndNotifyLoadingCompleted(document);
        });
    });
    menu->addAction(tr("Choose ChatGPT runtime…"), this, [this] {
        const QString path = QFileDialog::getOpenFileName(this, tr("Choose Codex executable"), {}, tr("Executable (*.exe)"));
        if (!path.isEmpty()) { QSettings("Afterimage", "Afterimage").setValue("Afterimage/codexExecutable", path); m_session->reconnectServer(); }
    });
    toolbar->addWidget(m_newChat);
    toolbar->addStretch();
    toolbar->addWidget(m_signIn);
    toolbar->addWidget(menuButton);
    layout->addLayout(toolbar);
    m_history = new QComboBox(body);
    m_history->setMinimumHeight(32);
    m_history->setAccessibleName(tr("Conversation history"));
    m_history->addItem(tr("New chat"), QString());
    layout->addWidget(m_history);
    m_artwork = new QLabel(tr("Describe a new artwork, or open one to edit together."), body);
    m_artwork->setWordWrap(true);
    layout->addWidget(m_artwork);
    m_useArtwork = button(tr("Use current artwork"), body);
    layout->addWidget(m_useArtwork);
    m_openArtwork = button(tr("Open created artwork"), body);
    m_openArtwork->hide();
    layout->addWidget(m_openArtwork);
    auto *tabs = new QTabWidget(body);
    tabs->setStyleSheet("QTabBar::tab { min-height: 32px; min-width: 64px; }");
    auto *conversation = new QWidget(tabs);
    auto *conversationLayout = new QVBoxLayout(conversation);
    conversationLayout->setContentsMargins(0, 0, 0, 0);
    m_earlier = button(tr("Load earlier messages"), conversation);
    m_earlier->hide();
    conversationLayout->addWidget(m_earlier);
    m_transcript = new QTextBrowser(conversation);
    m_transcript->setObjectName("AfterimageTranscript");
    m_transcript->setOpenLinks(false);
    m_transcript->setOpenExternalLinks(false);
    m_transcript->setFrameShape(QFrame::NoFrame);
    m_transcript->setStyleSheet("QTextBrowser { background: #20252b; color: #f1f3f5; border: 0; padding: 8px; }");
    m_transcript->document()->setDefaultStyleSheet("p { margin: 4px 0 9px 0; } pre { background: #171b20; padding: 7px; } code { color: #d6deeb; }");
    conversationLayout->addWidget(m_transcript, 1);
    m_latest = button(tr("↓ Latest messages"), m_transcript);
    m_latest->hide();
    tabs->addTab(conversation, tr("Conversation"));
    auto *candidatePage = new QWidget(tabs);
    auto *candidateLayout = new QVBoxLayout(candidatePage);
    auto *subscriptionButton = button(tr("Generate with ChatGPT"), candidatePage);
    subscriptionButton->setToolTip(tr("Use your ChatGPT subscription in Conversation."));
    candidateLayout->addWidget(subscriptionButton);
    m_apiToggle = button(tr("Generate image with API ▾"), candidatePage);
    m_apiToggle->setObjectName("AfterimageApiToggle");
    candidateLayout->addWidget(m_apiToggle);
    m_apiScroll = new QScrollArea(candidatePage);
    m_apiScroll->setWidgetResizable(true);
    m_apiScroll->setFrameShape(QFrame::NoFrame);
    m_apiScroll->setHorizontalScrollBarPolicy(Qt::ScrollBarAlwaysOff);
    m_apiScroll->setMaximumHeight(340);
    m_apiGroup = new QGroupBox(tr("Direct image API"), m_apiScroll);
    auto *apiGroup = m_apiGroup;
    auto *apiLayout = new QVBoxLayout(apiGroup);
    auto *billing = new QLabel(tr("Uses your OpenAI or Google API key. API usage is billed separately from your ChatGPT subscription."), apiGroup);
    billing->setWordWrap(true);
    apiLayout->addWidget(billing);
    apiLayout->addWidget(new QLabel(tr("Provider"), apiGroup));
    m_apiProvider = new QComboBox(apiGroup);
    m_apiProvider->setAccessibleName(tr("Image API provider"));
    m_apiProvider->setMinimumHeight(32);
    m_apiProvider->addItem(tr("Google Gemini API"), "gemini");
    m_apiProvider->addItem(tr("OpenAI API"), "openai");
    m_apiModel = new QComboBox(apiGroup);
    m_apiModel->setAccessibleName(tr("Image API model"));
    m_apiModel->setMinimumHeight(32);
    apiLayout->addWidget(m_apiProvider);
    apiLayout->addWidget(new QLabel(tr("Image model"), apiGroup));
    apiLayout->addWidget(m_apiModel);
    m_apiKeyToggle = button(tr("API key…"), apiGroup);
    apiLayout->addWidget(m_apiKeyToggle);
    m_apiKeyPanel = new QWidget(apiGroup);
    auto *apiKeyPanelLayout = new QVBoxLayout(m_apiKeyPanel);
    apiKeyPanelLayout->setContentsMargins(0, 0, 0, 0);
    auto *apiKeyRow = new QHBoxLayout;
    m_apiKey = new QLineEdit(m_apiKeyPanel);
    m_apiKey->setEchoMode(QLineEdit::Password);
    m_apiKey->setPlaceholderText(tr("API key"));
    m_apiKey->setToolTip(tr("Saved in Windows Credential Manager for this provider."));
    m_apiKey->setAccessibleName(tr("Provider API key"));
    m_apiSaveKey = button(tr("Save key"), m_apiKeyPanel);
    m_apiForgetKey = button(tr("Remove"), m_apiKeyPanel);
    apiKeyRow->addWidget(m_apiKey, 1);
    apiKeyRow->addWidget(m_apiSaveKey);
    apiKeyRow->addWidget(m_apiForgetKey);
    apiKeyPanelLayout->addLayout(apiKeyRow);
    apiLayout->addWidget(m_apiKeyPanel);
    m_apiPrompt = new QPlainTextEdit(apiGroup);
    m_apiPrompt->setAccessibleName(tr("Direct image prompt"));
    m_apiPrompt->setPlaceholderText(tr("Describe the image or change…"));
    m_apiPrompt->setFixedHeight(70);
    apiLayout->addWidget(m_apiPrompt);
    auto *apiOptions = new QHBoxLayout;
    m_apiScope = new QComboBox(apiGroup);
    m_apiScope->setAccessibleName(tr("Image source"));
    m_apiScope->addItem(tr("New image"), "none");
    m_apiScope->addItem(tr("Edit selection"), "selection");
    m_apiScope->addItem(tr("Edit canvas"), "canvas");
    m_apiIntent = new QComboBox(apiGroup);
    m_apiIntent->setAccessibleName(tr("Image edit intent"));
    m_apiIntent->addItem(tr("Replace area"), "replacement");
    m_apiIntent->addItem(tr("Add transparent foreground"), "addition");
    m_apiAspect = new QComboBox(apiGroup);
    m_apiAspect->setAccessibleName(tr("New image aspect ratio"));
    m_apiAspect->addItem(tr("Square 1:1"), "1:1");
    m_apiAspect->addItem(tr("Portrait 2:3"), "2:3");
    m_apiAspect->addItem(tr("Landscape 3:2"), "3:2");
    m_apiAspect->addItem(tr("Wide 16:9"), "16:9");
    m_apiAspect->addItem(tr("Tall 9:16"), "9:16");
    apiOptions->addWidget(m_apiScope);
    apiOptions->addWidget(m_apiIntent);
    apiLayout->addLayout(apiOptions);
    apiLayout->addWidget(m_apiAspect);
    m_apiGenerate = button(tr("Generate with API"), apiGroup);
    apiLayout->addWidget(m_apiGenerate);
    m_apiCancel = button(tr("Cancel request"), apiGroup);
    m_apiCancel->setEnabled(false);
    apiLayout->addWidget(m_apiCancel);
    m_apiStatus = new QLabel(apiGroup);
    m_apiStatus->setWordWrap(true);
    apiLayout->addWidget(m_apiStatus);
    m_apiScroll->setWidget(apiGroup);
    candidateLayout->addWidget(m_apiScroll);
    m_candidates = new QListWidget(candidatePage);
    m_candidates->setIconSize(QSize(112, 112));
    m_candidates->setSpacing(6);
    m_candidates->setWordWrap(true);
    m_candidates->setHorizontalScrollBarPolicy(Qt::ScrollBarAlwaysOff);
    candidateLayout->addWidget(m_candidates);
    m_compare = button(tr("Compare with source"), candidatePage);
    candidateLayout->addWidget(m_compare);
    m_alignSource = new QCheckBox(tr("Place at original position"), candidatePage);
    m_alignSource->setMinimumHeight(32);
    m_alignSource->setToolTip(tr("Fit the image to its captured area and retain the original selection as an editable mask."));
    candidateLayout->addWidget(m_alignSource);
    m_nearest = new QCheckBox(tr("Keep pixel edges sharp"), candidatePage);
    m_nearest->setMinimumHeight(32);
    candidateLayout->addWidget(m_nearest);
    m_place = button(tr("Place in current artwork"), candidatePage);
    candidateLayout->addWidget(m_place);
    tabs->addTab(candidatePage, tr("Images"));
    connect(subscriptionButton, &QPushButton::clicked, this, [this, tabs] {
        tabs->setCurrentIndex(0);
        m_prompt->setFocus();
    });
    layout->addWidget(tabs, 1);
    m_requests = new QWidget(body);
    m_requestLayout = new QVBoxLayout(m_requests);
    m_requestLayout->setContentsMargins(0, 0, 0, 0);
    layout->addWidget(m_requests);
    m_scope = new QComboBox(body);
    m_scope->setMinimumHeight(36);
    m_scope->setAccessibleName(tr("Artwork task"));
    m_scope->addItem(tr("Chat about artwork"), QString());
    m_scope->addItem(tr("Edit selected area"), "selection");
    m_scope->addItem(tr("Edit whole canvas"), "canvas");
    conversationLayout->addWidget(m_scope);
    auto *modelRow = new QHBoxLayout;
    auto *modelColumn = new QVBoxLayout;
    auto *modelLabel = new QLabel(tr("Model"), body);
    m_models = new QComboBox(body);
    m_models->setMinimumHeight(36);
    m_models->setAccessibleName(tr("Chat model"));
    const QString preferredChatModel = QSettings("Afterimage", "Afterimage")
        .value("Afterimage/defaultChatModel", "gpt-6-sol").toString();
    m_models->addItem(tr("%1 · loading models…").arg(preferredChatModel), QString());
    modelLabel->setBuddy(m_models);
    modelColumn->addWidget(modelLabel);
    modelColumn->addWidget(m_models);
    modelRow->addLayout(modelColumn, 3);
    auto *reasoningColumn = new QVBoxLayout;
    auto *reasoningLabel = new QLabel(tr("Reasoning"), body);
    m_reasoning = new QComboBox(body);
    m_reasoning->setMinimumHeight(36);
    m_reasoning->setAccessibleName(tr("Reasoning level"));
    reasoningLabel->setBuddy(m_reasoning);
    m_makeDefault = button(tr("Make default"), body);
    m_makeDefault->setToolTip(tr("Use this model and reasoning level for new chats."));
    m_makeDefault->hide();
    reasoningColumn->addWidget(reasoningLabel);
    reasoningColumn->addWidget(m_reasoning);
    modelRow->addLayout(reasoningColumn, 2);
    conversationLayout->addLayout(modelRow);
    m_prompt = new QPlainTextEdit(body);
    m_prompt->setObjectName("AfterimageComposer");
    m_prompt->setPlaceholderText(tr("Describe what you want to make or change…"));
    m_prompt->setAccessibleName(tr("Message to ChatGPT"));
    m_prompt->setFixedHeight(76);
    conversationLayout->addWidget(m_prompt);
    auto *sendRow = new QHBoxLayout;
    sendRow->addStretch();
    m_stop = button(tr("Stop"), body);
    m_send = button(tr("Send"), body);
    m_send->setObjectName("AfterimageSend");
    sendRow->addWidget(m_stop);
    sendRow->addWidget(m_send);
    conversationLayout->addLayout(sendRow);
    m_status = new QLabel(tr("ChatGPT is disconnected"), body);
    m_status->setObjectName("AfterimageStatus");
    m_status->setWordWrap(true);
    m_status->setTextInteractionFlags(Qt::TextSelectableByMouse);
    conversationLayout->addWidget(m_status);
    setWidget(body);
    setMinimumWidth(340);
    const QSettings apiSettings("Afterimage", "Afterimage");
    const QString savedProvider = apiSettings.value("Afterimage/imageApiProvider", "gemini").toString();
    m_apiProvider->setCurrentIndex(qMax(0, m_apiProvider->findData(savedProvider)));
    const auto refreshApiModel = [this] {
        const QString provider = m_apiProvider->currentData().toString();
        const QString previous = QSettings("Afterimage", "Afterimage").value("Afterimage/imageApiModel/" + provider).toString();
        m_apiModel->clear();
        for (const QJsonValue &entry : AfterimageApiImages::catalog().value(provider).toArray()) {
            const QJsonObject model = entry.toObject();
            m_apiModel->addItem(model.value("id").toString(), model.value("id").toString());
            m_apiModel->setItemData(m_apiModel->count() - 1, model.value("label").toString(), Qt::ToolTipRole);
        }
        const int oldIndex = m_apiModel->findData(previous);
        if (oldIndex >= 0) m_apiModel->setCurrentIndex(oldIndex);
        m_apiStatus->setText(AfterimageApiImages::hasKey(provider)
            ? tr("API key saved for this provider.") : tr("Save this provider's API key to generate."));
        m_apiForgetKey->setEnabled(AfterimageApiImages::hasKey(provider));
        m_apiKeyPanel->setVisible(!AfterimageApiImages::hasKey(provider));
        if (provider == "gemini" && AfterimageApiImages::hasKey(provider) && m_apiIntent->currentData() == "addition")
            m_apiStatus->setText(tr("Gemini can edit images, but this route has no explicit transparent-background setting. Check the result's alpha before placing an addition."));
    };
    connect(m_apiProvider, qOverload<int>(&QComboBox::currentIndexChanged), this, [this, refreshApiModel] {
        QSettings("Afterimage", "Afterimage").setValue("Afterimage/imageApiProvider", m_apiProvider->currentData().toString());
        refreshApiModel();
    });
    connect(m_apiModel, qOverload<int>(&QComboBox::currentIndexChanged), this, [this] {
        QSettings("Afterimage", "Afterimage").setValue("Afterimage/imageApiModel/" + m_apiProvider->currentData().toString(), m_apiModel->currentData().toString());
    });
    refreshApiModel();
    connect(m_apiToggle, &QPushButton::clicked, this, [this] {
        m_apiScroll->setVisible(m_apiScroll->isHidden());
        m_apiToggle->setText(m_apiScroll->isHidden() ? tr("Generate image with API ▸") : tr("Generate image with API ▾"));
    });
    connect(m_apiKeyToggle, &QPushButton::clicked, this, [this] {
        m_apiKeyPanel->setVisible(!m_apiKeyPanel->isVisible());
    });
    connect(m_apiScope, qOverload<int>(&QComboBox::currentIndexChanged), this, [this] {
        m_apiAspect->setEnabled(m_apiScope->currentData() == "none");
    });
    connect(m_apiIntent, qOverload<int>(&QComboBox::currentIndexChanged), this, [refreshApiModel] { refreshApiModel(); });
    connect(m_apiSaveKey, &QPushButton::clicked, this, [this, refreshApiModel] {
        QString error;
        if (!AfterimageApiImages::saveKey(m_apiProvider->currentData().toString(), m_apiKey->text(), &error)) {
            m_apiStatus->setText(error); return;
        }
        m_apiKey->clear();
        refreshApiModel();
    });
    connect(m_apiForgetKey, &QPushButton::clicked, this, [this, refreshApiModel] {
        QString error;
        if (!AfterimageApiImages::forgetKey(m_apiProvider->currentData().toString(), &error)) {
            m_apiStatus->setText(error); return;
        }
        refreshApiModel();
    });
    connect(m_apiGenerate, &QPushButton::clicked, this, [this] {
        m_apiGenerate->setEnabled(false);
        m_apiStatus->setText(tr("Generating image…"));
        KisDocument *document = m_canvas ? m_canvas->viewManager()->document() : nullptr;
        const QJsonObject request{{"provider", m_apiProvider->currentData().toString()},
            {"model", m_apiModel->currentData().toString()}, {"prompt", m_apiPrompt->toPlainText().trimmed()},
            {"scope", m_apiScope->currentData().toString()}, {"intent", m_apiIntent->currentData().toString()},
            {"aspect", m_apiAspect->currentData().toString()}};
        m_apiImages->start(document, request, [this](bool ok, const QJsonObject &result) {
            m_apiGenerate->setEnabled(true);
            if (ok) { m_apiLatestJobId = result.value("jobId").toString(); m_apiCancel->setEnabled(true); }
            m_apiStatus->setText(ok ? tr("Generating image…") : result.value("error").toString());
        });
    });
    connect(m_apiCancel, &QPushButton::clicked, this, [this] {
        m_apiImages->cancel(m_apiLatestJobId, [this](bool ok, const QJsonObject &result) {
            m_apiCancel->setEnabled(false);
            m_apiStatus->setText(ok ? tr("Request cancelled. A request already accepted by the provider may still be billed.")
                : result.value("error").toString());
        });
    });
    connect(m_apiImages, &AfterimageApiImages::jobReady, this, [this](const QJsonObject &candidate) {
        if (candidate.value("jobId").toString() == m_apiLatestJobId) m_apiCancel->setEnabled(false);
        const bool missingAlpha = candidate.value("intent").toString() == "addition" && !candidate.value("hasTransparency").toBool();
        m_apiStatus->setText(missingAlpha
            ? tr("The image from %1 has no transparency. Compare it before adding it to your artwork.").arg(candidate.value("imageModel").toString())
            : tr("Image ready from %1. Compare or add it to your artwork.").arg(candidate.value("imageModel").toString()));
        restoreCandidates();
        m_apiScroll->hide();
        m_apiToggle->setText(tr("Generate image with API ▸"));
    });
    connect(m_apiImages, &AfterimageApiImages::jobFailed, this, [this](const QString &id, const QString &error) {
        if (id == m_apiLatestJobId) m_apiCancel->setEnabled(false);
        m_apiStatus->setText(error);
    });
    connect(m_newChat, &QPushButton::clicked, this, [this] {
        m_session->newThread();
        selectDefaultModel();
    });
    connect(m_useArtwork, &QPushButton::clicked, this, [this] {
        m_conversationDocument = m_canvas ? m_canvas->viewManager()->document() : nullptr;
        m_targetKnown = true;
        m_blankTarget = !m_conversationDocument;
        m_targetExplicit = true;
        const QString id = m_session->threadId();
        if (!id.isEmpty()) {
            m_knownTargets.insert(id);
            m_threadDocuments[id] = m_conversationDocument;
            if (m_blankTarget) m_blankTargets.insert(id); else m_blankTargets.remove(id);
        }
        updateArtworkTarget();
        updateActions();
    });
    connect(m_openArtwork, &QPushButton::clicked, this, [this] {
        if (m_pendingArtwork) {
            if (auto *window = qobject_cast<KisMainWindow *>(this->window())) window->showDocument(m_pendingArtwork);
        }
        m_pendingArtwork.clear();
        m_openArtwork->hide();
    });
    connect(m_signIn, &QPushButton::clicked, m_session, &AfterimageSession::signIn);
    connect(m_send, &QPushButton::clicked, this, &AfterimageDock::send);
    connect(m_stop, &QPushButton::clicked, m_session, &AfterimageSession::interrupt);
    connect(m_stop, &QPushButton::clicked, m_documents, &AfterimageDocumentBridge::cancelPending);
    connect(m_stop, &QPushButton::clicked, this, [this] { m_preparing = false; updateActions(); });
    connect(m_place, &QPushButton::clicked, this, &AfterimageDock::placeCandidate);
    connect(m_earlier, &QPushButton::clicked, this, [this] {
        m_followingTranscript = false;
        m_session->loadEarlierMessages();
    });
    connect(m_latest, &QPushButton::clicked, this, [this] {
        m_followingTranscript = true;
        m_transcript->verticalScrollBar()->setValue(m_transcript->verticalScrollBar()->maximum());
        updateLatestButton();
    });
    connect(m_transcript->verticalScrollBar(), &QScrollBar::valueChanged, this, &AfterimageDock::updateLatestButton);
    connect(m_transcript->verticalScrollBar(), &QScrollBar::rangeChanged, this, [this] {
        if (m_followingTranscript) m_transcript->verticalScrollBar()->setValue(m_transcript->verticalScrollBar()->maximum());
        updateLatestButton();
    });
    connect(m_transcript->verticalScrollBar(), &QScrollBar::actionTriggered, this, [this] {
        QTimer::singleShot(0, this, [this] {
            auto *bar = m_transcript->verticalScrollBar();
            m_followingTranscript = bar->value() >= bar->maximum() - 8;
            updateLatestButton();
        });
    });
    connect(m_transcript, &QTextBrowser::anchorClicked, this, [](const QUrl &url) {
        if (url.scheme() == "https" || url.scheme() == "http") QDesktopServices::openUrl(url);
    });
    connect(m_compare, &QPushButton::clicked, this, &AfterimageDock::compareCandidate);
    connect(m_alignSource, &QCheckBox::toggled, this, &AfterimageDock::updateActions);
    connect(m_candidates, &QListWidget::itemDoubleClicked, this, [this] { compareCandidate(); });
    connect(m_candidates, &QListWidget::currentRowChanged, this, [this] {
        const auto candidate = m_candidates->currentItem() ? m_candidates->currentItem()->data(Qt::UserRole + 1).toJsonObject() : QJsonObject();
        const bool hasSource = candidate["source"].toObject()["preparedSource"].toObject()["placement"] == "sourceRect";
        m_alignSource->setEnabled(hasSource);
        m_alignSource->setChecked(hasSource);
        updateActions();
    });
    connect(m_prompt, &QPlainTextEdit::textChanged, this, [this] {
        m_prompt->setFixedHeight(qBound(76, int(m_prompt->document()->size().height()) + 16, 136));
        updateActions();
    });
    connect(m_session, &AfterimageSession::status, m_status, &QLabel::setText);
    connect(m_session, &AfterimageSession::failure, this, [this](const QString &message) {
        m_status->setText(message);
    });
    connect(m_session, &AfterimageSession::busyChanged, this, [this](bool busy) {
        if (!busy) m_steeringPending = false;
        updateActions();
    });
    connect(m_session, &AfterimageSession::steeringAvailabilityChanged, this, &AfterimageDock::updateActions);
    connect(m_session, &AfterimageSession::steeringAccepted, this, [this](const QString &text) {
        m_steeringPending = false;
        appendMessage(tr("You"), text);
        if (m_prompt->toPlainText().trimmed() == text) m_prompt->clear();
        updateActions();
    });
    connect(m_session, &AfterimageSession::steeringFailed, this, [this](const QString &error) {
        m_steeringPending = false;
        m_status->setText(error);
        updateActions();
    });
    connect(m_session, &AfterimageSession::readinessChanged, this, [this](bool, bool signedIn) {
        m_signedIn = signedIn;
        if (!m_catalogLoaded && m_models->count() == 1) {
            const QString preferred = QSettings("Afterimage", "Afterimage")
                .value("Afterimage/defaultChatModel", "gpt-6-sol").toString();
            m_models->setItemText(0, signedIn ? tr("%1 · loading models…").arg(preferred)
                                              : tr("%1 · sign in to load models").arg(preferred));
        }
        updateActions();
    });
    connect(m_session, &AfterimageSession::modelsReceived, this, [this](const QJsonArray &models) {
        const QString previous = m_models->currentData().toString();
        m_models->blockSignals(true);
        m_models->clear();
        m_modelCatalog.clear();
        for (const auto &value : models) {
            const auto model = value.toObject();
            const QString id = model["model"].toString();
            if (model["hidden"].toBool() || id.isEmpty()) continue;
            m_models->addItem(model["displayName"].toString(id), id);
            m_models->setItemData(m_models->count() - 1, id, Qt::ToolTipRole);
            m_modelCatalog.insert(id, model);
        }
        const int selected = m_models->findData(previous);
        m_models->setCurrentIndex(selected);
        m_models->blockSignals(false);
        m_catalogLoaded = true;
        if (previous.isEmpty()) selectDefaultModel();
        else if (selected >= 0) updateReasoningLevels();
        else {
            m_models->insertItem(0, m_signedIn ? tr("%1 unavailable — choose a model").arg(previous)
                                                 : tr("%1 · sign in to load models").arg(previous), QString());
            m_models->setCurrentIndex(0);
            updateReasoningLevels();
        }
    });
    connect(m_models, qOverload<int>(&QComboBox::currentIndexChanged), this, [this] {
        updateReasoningLevels();
    });
    connect(m_reasoning, qOverload<int>(&QComboBox::currentIndexChanged), this, [this] {
        m_session->setReasoningEffort(m_reasoning->currentData().toString());
        updateActions();
    });
    connect(m_makeDefault, &QPushButton::clicked, this, [this] {
        QSettings settings("Afterimage", "Afterimage");
        settings.setValue("Afterimage/defaultChatModel", m_models->currentData().toString());
        settings.setValue("Afterimage/defaultReasoningEffort", m_reasoning->currentData().toString());
        updateActions();
    });
    connect(m_defaultAction, &QAction::triggered, m_makeDefault, &QPushButton::click);
    connect(m_history, qOverload<int>(&QComboBox::activated), this, [this](int index) {
        const QString id = m_history->itemData(index).toString();
        if (id == "more") { m_session->listThreads(m_nextCursor); return; }
        if (id.isEmpty()) { m_session->newThread(); selectDefaultModel(); }
        else m_session->openThread(id);
    });
    connect(m_session, &AfterimageSession::threadChanged, this, [this](const QString &id) {
        m_history->setCurrentIndex(qMax(0, m_history->findData(id)));
        if (id.isEmpty()) {
            m_pendingThreadStart = false;
            m_conversationDocument = m_canvas ? m_canvas->viewManager()->document() : nullptr;
            m_targetKnown = true;
            m_blankTarget = !m_conversationDocument;
            m_targetExplicit = false;
        } else if (m_pendingThreadStart) {
            m_pendingThreadStart = false;
            m_knownTargets.insert(id);
            m_threadDocuments[id] = m_conversationDocument;
            if (m_blankTarget) m_blankTargets.insert(id); else m_blankTargets.remove(id);
        } else {
            m_targetKnown = m_knownTargets.contains(id);
            m_blankTarget = m_blankTargets.contains(id);
            m_conversationDocument = m_targetKnown ? m_threadDocuments.value(id) : QPointer<KisDocument>();
            m_targetExplicit = m_targetKnown;
        }
        updateArtworkTarget();
        updateActions();
    });
    connect(m_session, &AfterimageSession::threadsReceived, this, [this](const QJsonObject &result) {
        const int more = m_history->findData("more");
        if (more >= 0) m_history->removeItem(more);
        for (const auto &value : result["data"].toArray()) {
            const auto thread = value.toObject();
            const QString id = thread["id"].toString();
            const QString label = thread["name"].toString(thread["preview"].toString(tr("Untitled chat"))).left(100);
            const int index = m_history->findData(id);
            if (index < 0) m_history->addItem(label, id); else m_history->setItemText(index, label);
        }
        m_nextCursor = result["nextCursor"].toString();
        if (!m_nextCursor.isEmpty()) m_history->addItem(tr("Load earlier conversations…"), "more");
        m_history->setCurrentIndex(qMax(0, m_history->findData(m_session->threadId())));
    });
    connect(m_session, &AfterimageSession::transcriptReceived, this, [this](const QJsonObject &thread) {
        Q_UNUSED(thread);
        m_transcript->clear(); m_fragments.clear(); m_fragmentOrder.clear(); m_streamStart = -1;
        m_followingTranscript = true;
        m_earlier->hide();
        updateLatestButton();
    });
    connect(m_session, &AfterimageSession::historyPageReceived, this, [this](const QJsonArray &turns, bool prepend, const QString &nextCursor) {
        QTextCursor cursor(m_transcript->document());
        cursor.movePosition(prepend ? QTextCursor::Start : QTextCursor::End);
        const auto message = [&cursor](const QString &role, const QString &text) { insertBubble(cursor, role, text); };
        const int height = m_transcript->verticalScrollBar()->maximum();
        const int scroll = m_transcript->verticalScrollBar()->value();
        const int characters = m_transcript->document()->characterCount();
        for (const auto &turn : turns) {
            for (const auto &value : turn.toObject()["items"].toArray()) {
                const auto item = value.toObject();
                if (item["type"] == "agentMessage") message(tr("ChatGPT"), item["text"].toString());
                else if (item["type"] == "userMessage") {
                    QStringList text;
                    for (const auto &part : item["content"].toArray()) if (part.toObject()["type"] == "text") text << part.toObject()["text"].toString().section("\n\nAfterimage artwork context:", 0, 0);
                    message(tr("You"), text.join('\n'));
                }
            }
        }
        if (prepend && m_streamStart >= 0) m_streamStart += m_transcript->document()->characterCount() - characters;
        const bool following = m_followingTranscript;
        m_transcript->verticalScrollBar()->setValue(prepend ? scroll + m_transcript->verticalScrollBar()->maximum() - height
            : following ? m_transcript->verticalScrollBar()->maximum() : scroll);
        if (!prepend && following) QTimer::singleShot(0, this, [this] {
            m_transcript->verticalScrollBar()->setValue(m_transcript->verticalScrollBar()->maximum());
            updateLatestButton();
        });
        m_earlier->setVisible(!nextCursor.isEmpty());
        updateLatestButton();
    });
    connect(m_session, &AfterimageSession::eventReceived, this, &AfterimageDock::handleEvent);
    connect(m_session, &AfterimageSession::requestReceived, this, &AfterimageDock::handleRequest);
    connect(m_images, &AfterimageImageStore::retained, this, [this](const QJsonObject &candidate) {
        m_documents->markCandidateReady(candidate);
        restoreCandidates();
        if (candidate["threadId"].toString() == m_session->threadId())
            m_status->setText(tr("Image ready. Find it under Images."));
    });
    connect(m_images, &AfterimageImageStore::failed, this, [this](const QString &message) { m_status->setText(message); });
    connect(m_images, &AfterimageImageStore::failedForItem, this, [this](const QString &itemId, const QString &message) {
        m_documents->markCandidateFailed(itemId, message);
    });
    restoreCandidates();
    m_apiScroll->setVisible(m_candidates->count() == 0);
    m_apiToggle->setText(m_apiScroll->isHidden() ? tr("Generate image with API ▸") : tr("Generate image with API ▾"));
    updateArtworkTarget();
    updateActions();
    if (!qApp->property("AfterimageOffscreenPreview").toBool())
        QTimer::singleShot(0, m_session, &AfterimageSession::connectServer);
}

void AfterimageDock::setCanvas(KoCanvasBase *canvas)
{
    m_canvas = dynamic_cast<KisCanvas2 *>(canvas);
    if (m_session->threadId().isEmpty() && !m_targetExplicit && !m_pendingThreadStart && !m_session->busy()) {
        m_conversationDocument = m_canvas ? m_canvas->viewManager()->document() : nullptr;
        m_blankTarget = !m_conversationDocument;
    }
    updateArtworkTarget();
    updateActions();
}

void AfterimageDock::unsetCanvas() { setCanvas(nullptr); }

void AfterimageDock::selectDefaultModel()
{
    if (!m_catalogLoaded) return;
    const QSettings settings("Afterimage", "Afterimage");
    const QString model = settings.value("Afterimage/defaultChatModel", "gpt-6-sol").toString();
    int index = m_models->findData(model);
    if (index < 0) {
        m_models->insertItem(0, m_signedIn ? tr("%1 unavailable — choose a model").arg(model)
                                             : tr("%1 · sign in to load models").arg(model), QString());
        index = 0;
    }
    m_models->setCurrentIndex(index);
    updateReasoningLevels();
    const int effort = m_reasoning->findData(settings.value("Afterimage/defaultReasoningEffort", "medium").toString());
    if (effort >= 0) m_reasoning->setCurrentIndex(effort);
    updateActions();
}

void AfterimageDock::updateReasoningLevels()
{
    const QString previous = m_reasoning->currentData().toString();
    const QString id = m_models->currentData().toString();
    const auto model = m_modelCatalog.value(id);
    m_reasoning->blockSignals(true);
    m_reasoning->clear();
    const QHash<QString, QString> labels{{"none", tr("None")}, {"minimal", tr("Minimal")},
        {"low", tr("Low")}, {"medium", tr("Medium")}, {"high", tr("High")},
        {"xhigh", tr("Extra high")}, {"max", tr("Maximum")}, {"ultra", tr("Ultra")}};
    for (const auto &value : model["supportedReasoningEfforts"].toArray()) {
        const auto option = value.toObject();
        const QString effort = option["reasoningEffort"].toString();
        if (effort.isEmpty()) continue;
        m_reasoning->addItem(labels.value(effort, effort), effort);
        m_reasoning->setItemData(m_reasoning->count() - 1, option["description"].toString(), Qt::ToolTipRole);
    }
    int index = m_reasoning->findData(previous);
    if (index < 0) index = m_reasoning->findData(model["defaultReasoningEffort"].toString());
    m_reasoning->setCurrentIndex(index);
    m_reasoning->blockSignals(false);
    m_session->setModel(id);
    m_session->setReasoningEffort(m_reasoning->currentData().toString());
    updateActions();
}

void AfterimageDock::updateActions()
{
    const bool busy = m_session->busy() || m_preparing;
    const bool modelSelected = !m_models->currentData().toString().isEmpty() && !m_reasoning->currentData().toString().isEmpty();
    m_send->setText(m_session->canSteer() ? tr("Send guidance") : tr("Send"));
    m_send->setToolTip(m_session->canSteer() ? tr("Send guidance to the active turn.") : tr("Send a message."));
    const bool usableTarget = m_targetKnown && (m_blankTarget || m_conversationDocument);
    m_send->setEnabled(m_session->ready() && m_signedIn && modelSelected && usableTarget && (!busy || m_session->canSteer())
        && !m_preparing && !m_steeringPending && !m_prompt->toPlainText().trimmed().isEmpty());
    m_stop->setEnabled(busy);
    m_newChat->setEnabled(!busy);
    m_history->setEnabled(!busy);
    m_scope->setEnabled(!busy);
    m_earlier->setEnabled(!busy);
    m_models->setEnabled(!busy && m_catalogLoaded);
    m_reasoning->setEnabled(!busy && m_reasoning->count() > 0);
    const QSettings settings("Afterimage", "Afterimage");
    const bool isDefault = modelSelected
        && m_models->currentData().toString() == settings.value("Afterimage/defaultChatModel", "gpt-6-sol").toString()
        && m_reasoning->currentData().toString() == settings.value("Afterimage/defaultReasoningEffort", "medium").toString();
    m_makeDefault->setText(isDefault ? tr("Default") : tr("Make default"));
    m_makeDefault->setEnabled(!busy && modelSelected && !isDefault);
    m_defaultAction->setEnabled(!busy && modelSelected && !isDefault);
    m_signIn->setVisible(!m_signedIn);
    m_place->setEnabled(m_candidates->currentItem() && !m_placing);
    if (!m_placing) {
        const QJsonObject selected = m_candidates->currentItem()
            ? m_candidates->currentItem()->data(Qt::UserRole + 1).toJsonObject() : QJsonObject();
        m_place->setText(selected.value("source").toObject().value("documentId").toString().isEmpty()
            ? tr("Add to current artwork") : tr("Add to original artwork"));
    }
    m_compare->setEnabled(m_candidates->currentItem());
    m_nearest->setEnabled(m_alignSource->isChecked());
    m_useArtwork->setEnabled(!busy);
}

void AfterimageDock::updateArtworkTarget()
{
    KisDocument *current = m_canvas ? m_canvas->viewManager()->document() : nullptr;
    if (!m_targetKnown) m_artwork->setText(tr("Choose artwork for this conversation."));
    else if (m_conversationDocument) m_artwork->setText(tr("Working with %1").arg(m_conversationDocument->caption()));
    else if (m_blankTarget) m_artwork->setText(tr("Describe an artwork to create, or open one to work on."));
    else m_artwork->setText(tr("This artwork was closed. Choose another canvas."));
    m_useArtwork->setText(current ? tr("Use current artwork: %1").arg(current->caption()) : tr("Start a new canvas"));
    m_useArtwork->setVisible(!m_targetKnown || (current != m_conversationDocument) || (!m_blankTarget && !m_conversationDocument));
}

QJsonObject AfterimageDock::documentContext(KisDocument *document) const
{
    if (!document || !document->image()) return {{"open", false}};
    if (!document->property("afterimageId").isValid()) document->setProperty("afterimageId", QUuid::createUuid().toString(QUuid::WithoutBraces));
    QJsonObject context = AfterimageDocumentBridge::documentSummary(document);
    context["documentId"] = document->property("afterimageId").toString();
    return context;
}

void AfterimageDock::send()
{
    if (!m_send->isEnabled()) return;
    const QString text = m_prompt->toPlainText().trimmed();
    if (m_session->canSteer()) {
        // Steering keeps the document and turn selected when this work began.
        m_steeringPending = true;
        m_session->steer(text);
        updateActions();
        return;
    }
    m_turnDocument = m_conversationDocument;
    m_documents->cancelPending();
    m_documents->bindDocument(m_turnDocument);
    m_turnContext = documentContext(m_turnDocument);
    const QString scope = m_scope->currentData().toString();
    if (!scope.isEmpty()) {
        m_preparing = true;
        m_status->setText(tr("Capturing edit area…"));
        updateActions();
        m_documents->invoke(m_turnDocument, "afterimage_prepare_edit", {{"scope", scope}}, [this, text](bool success, const QJsonArray &content) {
            m_preparing = false;
            if (!success || !m_turnDocument) {
                const auto details = content.isEmpty() ? QJsonObject() : QJsonDocument::fromJson(content.first().toObject()["text"].toString().toUtf8()).object();
                m_status->setText(details["error"].toString(tr("The edit area could not be captured.")));
                updateActions(); return;
            }
            m_turnContext = documentContext(m_turnDocument);
            m_turnContext["preparedSource"] = QJsonDocument::fromJson(content.first().toObject()["text"].toString().toUtf8()).object();
            appendMessage(tr("You"), text);
            if (m_prompt->toPlainText().trimmed() == text) m_prompt->clear();
            m_pendingThreadStart = m_session->threadId().isEmpty();
            m_session->send(text, m_turnContext, tools());
            updateActions();
        });
        return;
    }
    appendMessage(tr("You"), text);
    m_prompt->clear();
    m_pendingThreadStart = m_session->threadId().isEmpty();
    m_session->send(text, m_turnContext, tools());
}

void AfterimageDock::appendMessage(const QString &role, const QString &text)
{
    auto *bar = m_transcript->verticalScrollBar();
    const bool following = m_followingTranscript;
    const int scroll = bar->value();
    // Existing history remains laid out. Only the streaming tail is replaced.
    QTextCursor cursor(m_transcript->document());
    if (m_streamStart >= 0) {
        cursor.setPosition(m_streamStart);
        cursor.movePosition(QTextCursor::End, QTextCursor::KeepAnchor);
        cursor.removeSelectedText();
        m_streamStart = -1;
    }
    cursor.movePosition(QTextCursor::End);
    insertBubble(cursor, role, text);
    bar->setValue(following ? bar->maximum() : scroll);
    if (following) QTimer::singleShot(0, this, [this] {
        m_transcript->verticalScrollBar()->setValue(m_transcript->verticalScrollBar()->maximum());
        updateLatestButton();
    });
    renderTranscript();
}

void AfterimageDock::renderTranscript()
{
    const bool atBottom = m_followingTranscript;
    const int scroll = m_transcript->verticalScrollBar()->value();
    QTextCursor cursor(m_transcript->document());
    if (m_streamStart >= 0) {
        cursor.setPosition(m_streamStart);
        cursor.movePosition(QTextCursor::End, QTextCursor::KeepAnchor);
        cursor.removeSelectedText();
    } else {
        cursor.movePosition(QTextCursor::End);
        m_streamStart = cursor.position();
    }
    for (const auto &id : m_fragmentOrder) insertBubble(cursor, tr("ChatGPT"), m_fragments.value(id));
    m_transcript->verticalScrollBar()->setValue(atBottom ? m_transcript->verticalScrollBar()->maximum() : scroll);
    if (atBottom) QTimer::singleShot(0, this, [this] {
        m_transcript->verticalScrollBar()->setValue(m_transcript->verticalScrollBar()->maximum());
        updateLatestButton();
    });
    updateLatestButton();
}

void AfterimageDock::updateLatestButton()
{
    auto *bar = m_transcript->verticalScrollBar();
    m_latest->adjustSize();
    m_latest->move(qMax(8, m_transcript->width() - m_latest->width() - 16),
        qMax(8, m_transcript->height() - m_latest->height() - 12));
    m_latest->raise();
    m_latest->setVisible(bar->maximum() > 0 && bar->value() < bar->maximum() - 8);
}

void AfterimageDock::handleEvent(const QString &method, const QJsonObject &params)
{
    if (method == "item/agentMessage/delta") {
        const QString id = params["itemId"].toString();
        if (!m_fragments.contains(id)) m_fragmentOrder.append(id);
        m_fragments[id] += params["delta"].toString();
        // Batch streamed text on the event loop; canvas input never waits on model I/O.
        if (!property("renderPending").toBool()) {
            setProperty("renderPending", true);
            QTimer::singleShot(60, this, [this] { setProperty("renderPending", false); renderTranscript(); });
        }
    } else if (method == "item/started") {
        const auto item = params["item"].toObject();
        if (item["type"] == "imageGeneration" && !item["id"].toString().isEmpty())
            m_generationOrigins.insert(item["id"].toString(), QJsonObject{{"source", m_turnContext},
                {"threadId", m_session->threadId()}, {"model", m_models->currentData().toString()},
                {"reasoningEffort", m_reasoning->currentData().toString()}});
    } else if (method == "item/completed") {
        const auto item = params["item"].toObject();
        if (item["type"] == "agentMessage") {
            m_fragments.remove(item["id"].toString());
            m_fragmentOrder.removeAll(item["id"].toString());
            appendMessage(tr("ChatGPT"), item["text"].toString());
        } else if (item["type"] == "imageGeneration")
            receiveImage(item, m_generationOrigins.take(item["id"].toString()));
    } else if (method == "turn/completed") {
        m_documents->cancelPending();
        while (auto *item = m_requestLayout->takeAt(0)) { delete item->widget(); delete item; }
    } else if (method == "error") {
        m_status->setText(params["error"].toObject()["message"].toString(params["message"].toString()));
    }
}

void AfterimageDock::handleTool(const QJsonValue &id, const QJsonObject &params)
{
    if (params["threadId"].toString() == m_session->threadId()) {
        const QString tool = params["tool"].toString();
        m_documents->invoke(m_turnDocument, tool, params["arguments"].toObject(), [this, id, tool](bool success, const QJsonArray &content) {
            if (success && (tool == "afterimage_create_document" || !m_turnDocument))
                m_turnDocument = m_documents->boundDocument();
            if (success && tool == "afterimage_create_document" && m_turnDocument) {
                m_conversationDocument = m_turnDocument;
                m_targetKnown = true;
                m_blankTarget = false;
                const QString thread = m_session->threadId();
                if (!thread.isEmpty()) {
                    m_knownTargets.insert(thread);
                    m_blankTargets.remove(thread);
                    m_threadDocuments[thread] = m_turnDocument;
                }
                m_turnContext = documentContext(m_turnDocument);
                updateArtworkTarget();
                auto *window = qobject_cast<KisMainWindow *>(this->window());
                if (!window || !window->presentDocumentWithoutFocus(m_turnDocument)) {
                    m_pendingArtwork = m_turnDocument;
                    m_openArtwork->show();
                }
            }
            if (success && tool == "afterimage_prepare_edit" && !content.isEmpty())
                m_turnContext["preparedSource"] = QJsonDocument::fromJson(content.first().toObject()["text"].toString().toUtf8()).object();
            m_session->answer(id, {{"success", success}, {"contentItems", content}});
        });
        return;
    }
    const QJsonObject result{{"error", "Unknown conversation"}};
    m_session->answer(id, {{"success", false}, {"contentItems", QJsonArray{QJsonObject{{"type", "inputText"},
        {"text", QString::fromUtf8(QJsonDocument(result).toJson(QJsonDocument::Compact))}}}}});
}

void AfterimageDock::handleRequest(const QJsonValue &id, const QString &method, const QJsonObject &params)
{
    if (method == "item/tool/call") { handleTool(id, params); return; }
    auto *panel = new QWidget(m_requests);
    auto *layout = new QVBoxLayout(panel);
    auto *label = new QLabel(params["reason"].toString(tr("ChatGPT needs your answer.")), panel);
    label->setWordWrap(true);
    layout->addWidget(label);
    if (method == "item/tool/requestUserInput") {
        QList<QPair<QString, QPlainTextEdit *>> fields;
        for (const auto &value : params["questions"].toArray()) {
            const auto question = value.toObject();
            auto *questionLabel = new QLabel(question["question"].toString(), panel);
            questionLabel->setWordWrap(true); layout->addWidget(questionLabel);
            auto *field = new QPlainTextEdit(panel); field->setMaximumHeight(80);
            layout->addWidget(field);
            fields.append({question["id"].toString(), field});
            for (const auto &optionValue : question["options"].toArray()) {
                const auto option = optionValue.toObject();
                auto *choice = button(option["label"].toString(), panel);
                choice->setToolTip(option["description"].toString());
                connect(choice, &QPushButton::clicked, field, [field, option] { field->setPlainText(option["label"].toString()); });
                layout->addWidget(choice);
            }
        }
        auto *submit = button(tr("Answer"), panel); layout->addWidget(submit);
        connect(submit, &QPushButton::clicked, this, [this, id, panel, fields] {
            QJsonObject answers;
            for (const auto &field : fields) answers[field.first] = QJsonObject{{"answers", QJsonArray{field.second->toPlainText()}}};
            m_session->answer(id, {{"answers", answers}}); panel->deleteLater();
        });
    } else if (method == "item/commandExecution/requestApproval" || method == "item/fileChange/requestApproval") {
        auto *details = new QPlainTextEdit(panel);
        details->setReadOnly(true); details->setMaximumHeight(120);
        details->setPlainText(QString::fromUtf8(QJsonDocument(params).toJson(QJsonDocument::Indented)));
        layout->addWidget(details);
        for (const auto &decision : {qMakePair(tr("Allow once"), QString("accept")), qMakePair(tr("Decline"), QString("decline"))}) {
            auto *choice = button(decision.first, panel); layout->addWidget(choice);
            connect(choice, &QPushButton::clicked, this, [this, id, panel, decision] {
                m_session->answer(id, {{"decision", decision.second}}); panel->deleteLater();
            });
        }
    } else {
        label->setText(tr("This ChatGPT request is not supported yet: %1. Stop the turn to continue.").arg(method));
    }
    m_requestLayout->addWidget(panel);
}

void AfterimageDock::receiveImage(const QJsonObject &item, const QJsonObject &origin)
{
    if (!item["failure"].isNull() && !item["failure"].isUndefined()) {
        const auto failure = item["failure"];
        const QString reason = failure.isString() ? failure.toString() : failure.toObject()["message"].toString(tr("The provider did not return an image."));
        m_status->setText(tr("Image generation failed: %1").arg(reason));
        return;
    }
    const QJsonObject metadata{{"provider", "chatgpt-subscription"},
        {"threadId", origin.value("threadId").toString(m_session->threadId())},
        {"source", origin.value("source").toObject(m_turnContext)},
        {"itemId", item["id"]}, {"prompt", item["revisedPrompt"]},
        {"model", origin.value("model").toString(m_models->currentData().toString())},
        {"chatModel", origin.value("model").toString(m_models->currentData().toString())},
        {"imageModel", item.value("imageModel")},
        {"reasoningEffort", origin.value("reasoningEffort").toString(m_reasoning->currentData().toString())}};
    m_documents->markCandidatePending(item["id"].toString());
    m_images->retain(item, metadata);
}

void AfterimageDock::restoreCandidates()
{
    const QString selected = m_candidates->currentItem() ? m_candidates->currentItem()->data(Qt::UserRole).toString() : QString();
    m_candidates->clear();
    const QDir directory(m_session->workspace() + "/candidates");
    for (const auto &folder : directory.entryInfoList(QDir::Dirs | QDir::NoDotAndDotDot, QDir::Time)) {
        const QString path = folder.absoluteFilePath() + "/image.png";
        if (!QFileInfo::exists(path)) continue;
        QFile metadataFile(folder.absoluteFilePath() + "/candidate.json");
        if (!metadataFile.open(QIODevice::ReadOnly)) continue;
        const auto metadata = QJsonDocument::fromJson(metadataFile.readAll()).object();
        const QSize size(metadata["width"].toInt(), metadata["height"].toInt());
        const QIcon thumbnail(folder.absoluteFilePath() + "/thumbnail.png");
        auto *entry = new QListWidgetItem(thumbnail, tr("%1 × %2").arg(size.width()).arg(size.height()), m_candidates);
        entry->setData(Qt::UserRole, path);
        entry->setData(Qt::UserRole + 1, metadata);
        const QString provider = metadata.value("provider").toString();
        const QString providerLabel = provider == "openai-api" ? tr("OpenAI API")
            : provider == "gemini-api" ? tr("Gemini API") : tr("ChatGPT");
        const QString model = provider == "chatgpt-subscription"
            ? metadata.value("chatModel").toString(metadata.value("model").toString())
            : metadata.value("imageModel").toString(metadata.value("requestedImageModel").toString());
        const QString identity = model.isEmpty() ? providerLabel : providerLabel + " · " + model;
        const QString description = metadata.value("prompt").toString().simplified().left(54);
        entry->setText(tr("%1\n%2 × %3\n%4").arg(identity).arg(size.width()).arg(size.height()).arg(description));
        const QString modelLine = metadata["provider"] == "chatgpt-subscription"
            ? tr("Chat: %1 · image model: %2").arg(metadata["chatModel"].toString(metadata["model"].toString()),
                metadata["imageModel"].toString(tr("not reported")))
            : tr("Image model requested: %1").arg(metadata["requestedImageModel"].toString(metadata["model"].toString()));
        entry->setToolTip(modelLine + "\n" + QLocale().toString(folder.lastModified(), QLocale::ShortFormat));
        if (selected == path) m_candidates->setCurrentItem(entry);
    }
    if (!m_candidates->currentItem() && m_candidates->count()) m_candidates->setCurrentRow(0);
    updateActions();
}

void AfterimageDock::placeCandidate()
{
    if (!m_candidates->currentItem() || m_placing) return;
    const QJsonObject candidate = m_candidates->currentItem()->data(Qt::UserRole + 1).toJsonObject();
    const QString originalId = candidate.value("source").toObject().value("documentId").toString();
    KisDocument *target = m_canvas ? m_canvas->viewManager()->document() : nullptr;
    if (!originalId.isEmpty()) {
        target = nullptr;
        for (const QPointer<KisDocument> &open : KisPart::instance()->documents()) {
            if (open && open->property("afterimageId").toString() == originalId) { target = open; break; }
        }
        if (!target) { m_apiStatus->setText(tr("The original artwork is closed. Reopen it before adding this image.")); return; }
    }
    if (!target) { m_apiStatus->setText(tr("Open an artwork before adding this image.")); return; }
    m_placing = true;
    m_place->setText(tr("Adding image…"));
    updateActions();
    m_documents->place(target, candidate,
        m_alignSource->isChecked(), m_nearest->isChecked(), [this](bool success, const QJsonArray &content) {
            m_placing = false;
            m_place->setText(tr("Add to artwork"));
            const auto result = QJsonDocument::fromJson(content.first().toObject()["text"].toString().toUtf8()).object();
            m_status->setText(success ? tr("Placed as a new layer. Undo restores the artwork.") : result["error"].toString());
            m_apiStatus->setText(m_status->text());
            updateActions();
        });
}

void AfterimageDock::compareCandidate()
{
    if (!m_candidates->currentItem()) return;
    const auto candidate = m_candidates->currentItem()->data(Qt::UserRole + 1).toJsonObject();
    auto *dialog = new QDialog(this);
    dialog->setAttribute(Qt::WA_DeleteOnClose);
    dialog->setWindowTitle(tr("Compare edit"));
    dialog->resize(1100, 700);
    auto *layout = new QVBoxLayout(dialog);
    auto *images = new QHBoxLayout;
    auto *before = new QLabel(tr("Loading source…"), dialog);
    auto *after = new QLabel(tr("Loading candidate…"), dialog);
    for (auto *label : {before, after}) {
        label->setAlignment(Qt::AlignCenter);
        label->setMinimumSize(250, 250);
        images->addWidget(label, 1);
    }
    layout->addLayout(images, 1);
    auto *description = new QLabel(tr("Source (left) · Candidate (right)\n%1").arg(candidate["prompt"].toString()), dialog);
    description->setWordWrap(true); layout->addWidget(description);
    auto *close = new QDialogButtonBox(QDialogButtonBox::Close, dialog);
    close->button(QDialogButtonBox::Close)->setMinimumSize(32, 32);
    connect(close, &QDialogButtonBox::rejected, dialog, &QDialog::close);
    layout->addWidget(close);
    auto *watcher = new QFutureWatcher<QPair<QImage, QImage>>(dialog);
    connect(watcher, &QFutureWatcher<QPair<QImage, QImage>>::finished, dialog, [watcher, before, after] {
        const auto result = watcher->result(); watcher->deleteLater();
        if (result.first.isNull()) before->setText(tr("No source image"));
        else before->setPixmap(QPixmap::fromImage(result.first).scaled(before->size(), Qt::KeepAspectRatio, Qt::SmoothTransformation));
        if (result.second.isNull()) after->setText(tr("The candidate could not be opened."));
        else after->setPixmap(QPixmap::fromImage(result.second).scaled(after->size(), Qt::KeepAspectRatio, Qt::SmoothTransformation));
    });
    watcher->setFuture(QtConcurrent::run([candidate] {
        const auto read = [](const QString &path) {
            QImageReader reader(path);
            const QSize size = reader.size();
            if (size.isValid()) reader.setScaledSize(size.scaled(1400, 1400, Qt::KeepAspectRatio));
            return reader.read();
        };
        return qMakePair(read(candidate["source"].toObject()["preparedSource"].toObject()["previewPath"].toString()), read(candidate["path"].toString()));
    }));
    dialog->show();
}
