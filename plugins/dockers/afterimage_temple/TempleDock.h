// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include <QDockWidget>
#include <QJsonObject>
#include <QJsonValue>
#include <QPointer>
#include <KoCanvasObserverBase.h>
#include <functional>

class KisCanvas2;
class KisDocument;
class QLabel;
class QListWidget;
class QComboBox;
class QCheckBox;
class QDoubleSpinBox;
class QSpinBox;
class QLineEdit;
class QPlainTextEdit;
class QWidget;
class QTimer;
class TempleStudioHost;

class TempleDock : public QDockWidget, public KoCanvasObserverBase
{
    Q_OBJECT
public:
    TempleDock();
    QString observerName() override { return QStringLiteral("TempleDock"); }
    void setCanvas(KoCanvasBase *canvas) override;
    void unsetCanvas() override;
private:
    void refreshProcessList();
    void refreshFormList();
    void refreshMaterials();
    void refreshEffectEditor();
    void refreshFormEditor();
    void refreshPalette();
    void refreshScore();
    void refreshScoreControls();
    void refreshScorePoints();
    void updateRecipe(const QJsonObject &recipe);
    void schedulePreview();
    void beginPreview(bool full, bool applyAfter);
    void renderFinished(const QString &id, const QJsonObject &result);
    void applyFinished(const QString &id, const QJsonObject &result);
    void editEffect(const std::function<void(QJsonObject &)> &change);
    void editEffectNested(const QStringList &path, const QJsonValue &value);
    void editForm(const std::function<void(QJsonObject &)> &change);
    void setEditor(QWidget *container, QWidget *editor);
    KisDocument *currentDocument() const;
    QPointer<KisCanvas2> m_canvas;
    QPointer<TempleStudioHost> m_studio;
    QJsonObject m_recipe;
    QLabel *m_status = nullptr;
    QLabel *m_document = nullptr;
    QLabel *m_preview = nullptr;
    QListWidget *m_processes = nullptr;
    QListWidget *m_forms = nullptr;
    QListWidget *m_materials = nullptr;
    QListWidget *m_scores = nullptr;
    QListWidget *m_scorePoints = nullptr;
    QComboBox *m_scoreOwner = nullptr;
    QComboBox *m_scoreControl = nullptr;
    QComboBox *m_scoreEase = nullptr;
    QDoubleSpinBox *m_scoreTime = nullptr;
    QDoubleSpinBox *m_scoreValue = nullptr;
    QCheckBox *m_scoreEnabled = nullptr;
    QComboBox *m_library = nullptr;
    QComboBox *m_formFamily = nullptr;
    QComboBox *m_where = nullptr;
    QComboBox *m_memory = nullptr;
    QLineEdit *m_effectSearch = nullptr;
    QLineEdit *m_formSearch = nullptr;
    QDoubleSpinBox *m_phase = nullptr;
    QWidget *m_effectEditor = nullptr;
    QWidget *m_formEditor = nullptr;
    QTimer *m_previewTimer = nullptr;
    QString m_runningId;
    QString m_previewId;
    QString m_fullId;
    bool m_rendering = false;
    bool m_dirty = false;
    bool m_applyAfter = false;
    bool m_pendingApply = false;
    QString m_pendingDocumentId;
    QJsonObject m_pendingRecipe;
};
