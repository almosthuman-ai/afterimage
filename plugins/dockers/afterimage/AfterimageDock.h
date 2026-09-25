// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include <QDockWidget>
#include <QPointer>
#include <QJsonObject>
#include <QHash>
#include <QSet>
#include <KoCanvasObserverBase.h>
#include <kis_canvas2.h>

class AfterimageSession;
class AfterimageImageStore;
class AfterimageDocumentBridge;
class AfterimageApiImages;
class KisDocument;
class QLabel;
class QPushButton;
class QComboBox;
class QCheckBox;
class QPlainTextEdit;
class QLineEdit;
class QGroupBox;
class QScrollArea;
class QWidget;
class QTextBrowser;
class QListWidget;
class QVBoxLayout;
class QAction;

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
    void receiveImage(const QJsonObject &item, const QJsonObject &origin);
    void placeCandidate();
    void restoreCandidates();
    void updateActions();
    void renderTranscript();
    void updateLatestButton();
    void updateArtworkTarget();
    void updateReasoningLevels();
    void selectDefaultModel();
    void compareCandidate();
    QPointer<KisCanvas2> m_canvas;
    QPointer<KisDocument> m_turnDocument;
    QPointer<KisDocument> m_conversationDocument;
    QPointer<KisDocument> m_pendingArtwork;
    AfterimageSession *m_session;
    AfterimageImageStore *m_images;
    AfterimageDocumentBridge *m_documents;
    AfterimageApiImages *m_apiImages;
    QLabel *m_status, *m_artwork;
    QPushButton *m_send, *m_stop, *m_newChat, *m_signIn, *m_place, *m_earlier, *m_makeDefault, *m_compare, *m_latest, *m_openArtwork, *m_useArtwork;
    QAction *m_defaultAction;
    QComboBox *m_history, *m_models, *m_reasoning, *m_scope;
    QComboBox *m_apiProvider, *m_apiModel, *m_apiScope, *m_apiIntent, *m_apiAspect;
    QPlainTextEdit *m_apiPrompt;
    QLineEdit *m_apiKey;
    QPushButton *m_apiGenerate, *m_apiCancel, *m_apiSaveKey, *m_apiForgetKey, *m_apiKeyToggle, *m_apiToggle;
    QGroupBox *m_apiGroup;
    QScrollArea *m_apiScroll;
    QWidget *m_apiKeyPanel;
    QLabel *m_apiStatus;
    QCheckBox *m_alignSource, *m_nearest;
    QPlainTextEdit *m_prompt;
    QTextBrowser *m_transcript;
    QListWidget *m_candidates;
    QWidget *m_requests;
    QVBoxLayout *m_requestLayout;
    QString m_nextCursor;
    int m_streamStart = -1;
    QStringList m_fragmentOrder;
    QHash<QString, QString> m_fragments;
    QHash<QString, QJsonObject> m_generationOrigins;
    QJsonObject m_turnContext;
    QString m_apiLatestJobId;
    QHash<QString, QJsonObject> m_modelCatalog;
    QHash<QString, QPointer<KisDocument>> m_threadDocuments;
    QSet<QString> m_knownTargets;
    QSet<QString> m_blankTargets;
    bool m_targetKnown = true;
    bool m_blankTarget = true;
    bool m_targetExplicit = false;
    bool m_pendingThreadStart = false;
    bool m_catalogLoaded = false;
    bool m_signedIn = false;
    bool m_preparing = false;
    bool m_placing = false;
    bool m_steeringPending = false;
    bool m_followingTranscript = true;
};
