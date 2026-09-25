// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include <QDockWidget>
#include <QPointer>
#include <QJsonObject>
#include <QHash>
#include <KoCanvasObserverBase.h>
#include <kis_canvas2.h>

class AfterimageSession;
class AfterimageImageStore;
class AfterimageDocumentBridge;
class KisDocument;
class QLabel;
class QPushButton;
class QComboBox;
class QPlainTextEdit;
class QTextBrowser;
class QListWidget;
class QVBoxLayout;

class AfterimageDock : public QDockWidget, public KoCanvasObserverBase
{
    Q_OBJECT
public:
    AfterimageDock();
    QString observerName() override { return "AfterimageDock"; }
    void setCanvas(KoCanvasBase *canvas) override;
    void unsetCanvas() override;
private:
    void send();
    QJsonObject documentContext(KisDocument *document) const;
    void appendMessage(const QString &role, const QString &text);
    void handleEvent(const QString &method, const QJsonObject &params);
    void handleRequest(const QJsonValue &id, const QString &method, const QJsonObject &params);
    void handleTool(const QJsonValue &id, const QJsonObject &params);
    void receiveImage(const QJsonObject &item);
    void placeCandidate();
    void restoreCandidates();
    void updateActions();
    void renderTranscript();
    QPointer<KisCanvas2> m_canvas;
    QPointer<KisDocument> m_turnDocument;
    AfterimageSession *m_session;
    AfterimageImageStore *m_images;
    AfterimageDocumentBridge *m_documents;
    QLabel *m_status, *m_artwork;
    QPushButton *m_send, *m_stop, *m_newChat, *m_signIn, *m_place, *m_earlier;
    QComboBox *m_history, *m_models;
    QPlainTextEdit *m_prompt;
    QTextBrowser *m_transcript;
    QListWidget *m_candidates;
    QWidget *m_requests;
    QVBoxLayout *m_requestLayout;
    QString m_nextCursor;
    int m_streamStart = -1;
    QStringList m_fragmentOrder;
    QHash<QString, QString> m_fragments;
    QJsonObject m_turnContext;
    bool m_signedIn = false;
};
