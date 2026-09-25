// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#include "AfterimageDock.h"
#include "AfterimageSession.h"
#include "AfterimageImageStore.h"
#include "AfterimageDocumentBridge.h"
#include <QComboBox>
#include <QDateTime>
#include <QDir>
#include <QFileDialog>
#include <QJsonDocument>
#include <QImageReader>
#include <QLocale>
#include <QLabel>
#include <QListWidget>
#include <QMenu>
#include <QPlainTextEdit>
#include <QPushButton>
#include <QSaveFile>
#include <QScrollBar>
#include <QSettings>
#include <QTabWidget>
#include <QTextBrowser>
#include <QTextCursor>
#include <QTimer>
#include <QVBoxLayout>
#include <QUuid>
#include <KisDocument.h>
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
    auto result = AfterimageDocumentBridge::tools();
    result.append(QJsonObject{{"type", "function"}, {"name", "afterimage_document"},
        {"description", "Inspect the artwork bound to this conversation turn, including dimensions, layers, visibility and selection bounds."},
        {"inputSchema", QJsonObject{{"type", "object"}, {"properties", QJsonObject{}}, {"additionalProperties", false}}}});
    return result;
}
QString markup(const QString &text)
{
    QTextDocument document;
    document.setMarkdown(text);
    const QString html = document.toHtml();
    const int body = html.indexOf("<body");
    return html.mid(html.indexOf('>', body) + 1).section("</body>", 0, 0);
}
QJsonArray layers(KisNodeSP parent)
{
    QJsonArray result;
    for (auto node = parent->lastChild(); node; node = node->prevSibling()) {
        QJsonObject item{{"id", node->uuid().toString(QUuid::WithoutBraces)}, {"name", node->name()},
            {"visible", node->visible()}, {"opacity", node->opacity()}, {"type", node->metaObject()->className()}};
        if (node->childCount()) item["children"] = layers(node);
        result.append(item);
    }
    return result;
}
}

AfterimageDock::AfterimageDock() : QDockWidget(tr("Afterimage")), m_session(new AfterimageSession(this))
{
    setProperty("ShowOnWelcomePage", true);
    m_images = new AfterimageImageStore(m_session->workspace() + "/candidates", this);
    m_documents = new AfterimageDocumentBridge(m_session->workspace(), this);
    auto *body = new QWidget(this);
    auto *layout = new QVBoxLayout(body);
    layout->setContentsMargins(8, 8, 8, 8);
    auto *toolbar = new QHBoxLayout;
    m_newChat = button(tr("New chat"), body);
    m_signIn = button(tr("Sign in"), body);
    auto *menuButton = button(tr("ChatGPT ▾"), body);
    auto *menu = new QMenu(menuButton);
    menuButton->setMenu(menu);
    menu->addAction(tr("Reconnect"), m_session, &AfterimageSession::reconnectServer);
    menu->addAction(tr("Refresh conversations"), this, [this] { m_session->listThreads(); });
    menu->addAction(tr("Sign out"), m_session, &AfterimageSession::signOut);
    menu->addSeparator();
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
    m_artwork = new QLabel(tr("Open an artwork to work together on it."), body);
    m_artwork->setWordWrap(true);
    layout->addWidget(m_artwork);
    auto *tabs = new QTabWidget(body);
    tabs->setStyleSheet("QTabBar::tab { min-height: 32px; min-width: 64px; }");
    auto *conversation = new QWidget(tabs);
    auto *conversationLayout = new QVBoxLayout(conversation);
    conversationLayout->setContentsMargins(0, 0, 0, 0);
    m_earlier = button(tr("Load earlier messages"), conversation);
    m_earlier->hide();
    conversationLayout->addWidget(m_earlier);
    m_transcript = new QTextBrowser(conversation);
    m_transcript->setOpenExternalLinks(true);
    conversationLayout->addWidget(m_transcript);
    tabs->addTab(conversation, tr("Conversation"));
    auto *candidatePage = new QWidget(tabs);
    auto *candidateLayout = new QVBoxLayout(candidatePage);
    m_candidates = new QListWidget(candidatePage);
    m_candidates->setIconSize(QSize(112, 112));
    m_candidates->setSpacing(6);
    candidateLayout->addWidget(m_candidates);
    m_place = button(tr("Place in current artwork"), candidatePage);
    candidateLayout->addWidget(m_place);
    tabs->addTab(candidatePage, tr("Images"));
    layout->addWidget(tabs, 1);
    m_requests = new QWidget(body);
    m_requestLayout = new QVBoxLayout(m_requests);
    m_requestLayout->setContentsMargins(0, 0, 0, 0);
    layout->addWidget(m_requests);
    m_prompt = new QPlainTextEdit(body);
    m_prompt->setPlaceholderText(tr("Describe what you want to make or change…"));
    m_prompt->setAccessibleName(tr("Message to ChatGPT"));
    m_prompt->setMaximumHeight(140);
    layout->addWidget(m_prompt);
    auto *sendRow = new QHBoxLayout;
    m_models = new QComboBox(body);
    m_models->setMinimumHeight(32);
    m_models->setAccessibleName(tr("ChatGPT model"));
    m_models->addItem(tr("Account default"), QString());
    sendRow->addWidget(m_models, 1);
    m_stop = button(tr("Stop"), body);
    m_send = button(tr("Send"), body);
    sendRow->addWidget(m_stop);
    sendRow->addWidget(m_send);
    layout->addLayout(sendRow);
    m_status = new QLabel(tr("ChatGPT is disconnected"), body);
    m_status->setWordWrap(true);
    m_status->setTextInteractionFlags(Qt::TextSelectableByMouse);
    layout->addWidget(m_status);
    setWidget(body);
    setMinimumWidth(340);
    connect(m_newChat, &QPushButton::clicked, m_session, &AfterimageSession::newThread);
    connect(m_signIn, &QPushButton::clicked, m_session, &AfterimageSession::signIn);
    connect(m_send, &QPushButton::clicked, this, &AfterimageDock::send);
    connect(m_stop, &QPushButton::clicked, m_session, &AfterimageSession::interrupt);
    connect(m_stop, &QPushButton::clicked, m_documents, &AfterimageDocumentBridge::cancelPending);
    connect(m_place, &QPushButton::clicked, this, &AfterimageDock::placeCandidate);
    connect(m_earlier, &QPushButton::clicked, m_session, &AfterimageSession::loadEarlierMessages);
    connect(m_candidates, &QListWidget::currentRowChanged, this, [this] { updateActions(); });
    connect(m_prompt, &QPlainTextEdit::textChanged, this, &AfterimageDock::updateActions);
    connect(m_session, &AfterimageSession::status, m_status, &QLabel::setText);
    connect(m_session, &AfterimageSession::failure, this, [this](const QString &message) {
        m_status->setText(message); appendMessage(tr("Afterimage"), message);
    });
    connect(m_session, &AfterimageSession::busyChanged, this, [this] { updateActions(); });
    connect(m_session, &AfterimageSession::readinessChanged, this, [this](bool, bool signedIn) {
        m_signedIn = signedIn; updateActions();
    });
    connect(m_session, &AfterimageSession::modelsReceived, this, [this](const QJsonArray &models) {
        m_models->blockSignals(true);
        m_models->clear();
        m_models->addItem(tr("Account default"), QString());
        for (const auto &value : models) {
            const auto model = value.toObject();
            if (!model["hidden"].toBool()) m_models->addItem(model["displayName"].toString(), model["model"].toString());
        }
        const int selected = m_models->findData(QSettings("Afterimage", "Afterimage").value("Afterimage/chatModel").toString());
        m_models->setCurrentIndex(qMax(0, selected));
        m_models->blockSignals(false);
    });
    connect(m_models, qOverload<int>(&QComboBox::currentIndexChanged), this, [this] {
        const QString model = m_models->currentData().toString();
        m_session->setModel(model); QSettings("Afterimage", "Afterimage").setValue("Afterimage/chatModel", model);
    });
    connect(m_history, qOverload<int>(&QComboBox::activated), this, [this](int index) {
        const QString id = m_history->itemData(index).toString();
        if (id == "more") { m_session->listThreads(m_nextCursor); return; }
        if (id.isEmpty()) m_session->newThread(); else m_session->openThread(id);
    });
    connect(m_session, &AfterimageSession::threadChanged, this, [this](const QString &id) {
        m_history->setCurrentIndex(qMax(0, m_history->findData(id)));
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
        m_earlier->hide();
    });
    connect(m_session, &AfterimageSession::historyPageReceived, this, [this](const QJsonArray &turns, bool prepend, const QString &nextCursor) {
        QString html;
        const auto message = [&html](const QString &role, const QString &text) { html += "<p><b>" + role.toHtmlEscaped() + "</b></p>" + markup(text); };
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
        const int height = m_transcript->verticalScrollBar()->maximum();
        const int scroll = m_transcript->verticalScrollBar()->value();
        const int characters = m_transcript->document()->characterCount();
        QTextCursor cursor(m_transcript->document());
        cursor.movePosition(prepend ? QTextCursor::Start : QTextCursor::End);
        cursor.insertHtml(html);
        cursor.insertBlock();
        if (prepend && m_streamStart >= 0) m_streamStart += m_transcript->document()->characterCount() - characters;
        m_transcript->verticalScrollBar()->setValue(prepend ? scroll + m_transcript->verticalScrollBar()->maximum() - height : m_transcript->verticalScrollBar()->maximum());
        m_earlier->setVisible(!nextCursor.isEmpty());
    });
    connect(m_session, &AfterimageSession::eventReceived, this, &AfterimageDock::handleEvent);
    connect(m_session, &AfterimageSession::requestReceived, this, &AfterimageDock::handleRequest);
    connect(m_images, &AfterimageImageStore::retained, this, [this](const QJsonObject &candidate) {
        restoreCandidates();
        if (candidate["threadId"].toString() == m_session->threadId())
            appendMessage(tr("Afterimage"), tr("Your image is ready in Images. Select it to place it as a new layer."));
    });
    connect(m_images, &AfterimageImageStore::failed, this, [this](const QString &message) { appendMessage(tr("Afterimage"), message); });
    restoreCandidates();
    updateActions();
    QTimer::singleShot(0, m_session, &AfterimageSession::connectServer);
}

void AfterimageDock::setCanvas(KoCanvasBase *canvas)
{
    m_canvas = dynamic_cast<KisCanvas2 *>(canvas);
    m_artwork->setText(m_canvas && m_canvas->viewManager()->document()
        ? tr("Artwork: %1").arg(m_canvas->viewManager()->document()->caption())
        : tr("Open an artwork to work together on it."));
    updateActions();
}

void AfterimageDock::unsetCanvas() { setCanvas(nullptr); }

void AfterimageDock::updateActions()
{
    const bool busy = m_session->busy();
    m_send->setEnabled(m_session->ready() && m_signedIn && !busy && !m_prompt->toPlainText().trimmed().isEmpty());
    m_stop->setEnabled(busy);
    m_newChat->setEnabled(!busy);
    m_history->setEnabled(!busy);
    m_earlier->setEnabled(!busy);
    m_models->setEnabled(!busy);
    m_signIn->setVisible(!m_signedIn);
    m_place->setEnabled(m_canvas && m_candidates->currentItem());
}

QJsonObject AfterimageDock::documentContext(KisDocument *document) const
{
    if (!document || !document->image()) return {{"open", false}};
    const auto image = document->image();
    if (!document->property("afterimageId").isValid()) document->setProperty("afterimageId", QUuid::createUuid().toString(QUuid::WithoutBraces));
    QJsonObject context{{"open", true}, {"documentId", document->property("afterimageId").toString()},
        {"title", document->caption()}, {"filePath", document->localFilePath()}, {"width", image->width()}, {"height", image->height()}, {"layers", layers(image->rootLayer())}};
    const auto selection = image->globalSelection();
    if (selection) {
        const QRect rect = selection->selectedExactRect();
        context["selectionBounds"] = QJsonArray{rect.x(), rect.y(), rect.width(), rect.height()};
    }
    return context;
}

void AfterimageDock::send()
{
    if (!m_send->isEnabled()) return;
    m_turnDocument = m_canvas ? m_canvas->viewManager()->document() : nullptr;
    m_documents->cancelPending();
    m_turnContext = documentContext(m_turnDocument);
    const QString text = m_prompt->toPlainText().trimmed();
    appendMessage(tr("You"), text);
    m_prompt->clear();
    m_session->send(text, m_turnContext, tools());
}

void AfterimageDock::appendMessage(const QString &role, const QString &text)
{
    // Existing history remains laid out. Only the streaming tail is replaced.
    QTextCursor cursor(m_transcript->document());
    if (m_streamStart >= 0) {
        cursor.setPosition(m_streamStart);
        cursor.movePosition(QTextCursor::End, QTextCursor::KeepAnchor);
        cursor.removeSelectedText();
        m_streamStart = -1;
    }
    cursor.movePosition(QTextCursor::End);
    cursor.insertHtml("<p><b>" + role.toHtmlEscaped() + "</b></p>" + markup(text));
    cursor.insertBlock();
    renderTranscript();
}

void AfterimageDock::renderTranscript()
{
    const bool atBottom = m_transcript->verticalScrollBar()->value() >= m_transcript->verticalScrollBar()->maximum() - 8;
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
    for (const auto &id : m_fragmentOrder) cursor.insertHtml(markup(m_fragments.value(id)));
    m_transcript->verticalScrollBar()->setValue(atBottom ? m_transcript->verticalScrollBar()->maximum() : scroll);
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
    } else if (method == "item/completed") {
        const auto item = params["item"].toObject();
        if (item["type"] == "agentMessage") {
            m_fragments.remove(item["id"].toString());
            m_fragmentOrder.removeAll(item["id"].toString());
            appendMessage(tr("ChatGPT"), item["text"].toString());
        } else if (item["type"] == "imageGeneration") receiveImage(item);
    } else if (method == "turn/completed") {
        m_documents->cancelPending();
        while (auto *item = m_requestLayout->takeAt(0)) { delete item->widget(); delete item; }
    } else if (method == "error") {
        m_status->setText(params["error"].toObject()["message"].toString(params["message"].toString()));
    }
}

void AfterimageDock::handleTool(const QJsonValue &id, const QJsonObject &params)
{
    if (params["threadId"].toString() == m_session->threadId() && params["tool"] != "afterimage_document") {
        const QString tool = params["tool"].toString();
        m_documents->invoke(m_turnDocument, tool, params["arguments"].toObject(), [this, id, tool](bool success, const QJsonArray &content) {
            if (success && tool == "afterimage_preview" && !content.isEmpty())
                m_turnContext["preparedSource"] = QJsonDocument::fromJson(content.first().toObject()["text"].toString().toUtf8()).object();
            m_session->answer(id, {{"success", success}, {"contentItems", content}});
        });
        return;
    }
    const bool valid = params["threadId"].toString() == m_session->threadId() && params["tool"] == "afterimage_document";
    const QJsonObject result = valid ? documentContext(m_turnDocument) : QJsonObject{{"error", "Unknown tool or conversation"}};
    m_session->answer(id, {{"success", valid}, {"contentItems", QJsonArray{QJsonObject{{"type", "inputText"},
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

void AfterimageDock::receiveImage(const QJsonObject &item)
{
    if (!item["failure"].isNull() && !item["failure"].isUndefined()) {
        const auto failure = item["failure"];
        const QString reason = failure.isString() ? failure.toString() : failure.toObject()["message"].toString(tr("The provider did not return an image."));
        appendMessage(tr("Afterimage"), tr("Image generation failed: %1").arg(reason));
        return;
    }
    const QJsonObject metadata{{"provider", "chatgpt-subscription"}, {"threadId", m_session->threadId()},
        {"source", m_turnContext}, {"itemId", item["id"]}, {"prompt", item["revisedPrompt"]},
        {"model", m_models->currentData().toString()}};
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
        entry->setToolTip(QLocale().toString(folder.lastModified(), QLocale::ShortFormat));
        if (selected == path) m_candidates->setCurrentItem(entry);
    }
    updateActions();
}

void AfterimageDock::placeCandidate()
{
    if (!m_canvas || !m_candidates->currentItem()) return;
    // Native importer preserves alpha, converts color consistently and adds one undoable layer.
    new KisImportCatcher(m_candidates->currentItem()->data(Qt::UserRole).toString(), m_canvas->viewManager(), "KisPaintLayer");
}
