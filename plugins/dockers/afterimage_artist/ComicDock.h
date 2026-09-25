// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include <QDockWidget>
#include <QPointer>
#include <KoCanvasObserverBase.h>
#include <kis_canvas2.h>

class ArtistNative;
class KisDocument;
class QLabel;
class QListWidget;
class QLineEdit;
class QComboBox;
class QSpinBox;
class QPlainTextEdit;
class QFontComboBox;
class QPushButton;

class ComicDock : public QDockWidget, public KoCanvasObserverBase
{
    Q_OBJECT
public:
    ComicDock();
    QString observerName() override { return "AfterimageComicDocker"; }
    void setCanvas(KoCanvasBase *canvas) override;
    void unsetCanvas() override { setCanvas(nullptr); }
private:
    KisDocument *document() const;
    void refreshPages();
    void applyPanels();
    void addLettering(bool balloon);
    void savePage();
    void exportPage(bool pdf);
    void movePage(int direction);
    void exportComic();
    QPointer<KisCanvas2> m_canvas;
    ArtistNative *m_native;
    QLabel *m_status, *m_project;
    QListWidget *m_pages;
    QLineEdit *m_title;
    QSpinBox *m_width, *m_height, *m_margin, *m_gutter, *m_textSize;
    QComboBox *m_layout;
    QFontComboBox *m_font;
    QPlainTextEdit *m_text;
    QPushButton *m_bookCancel;
    QString m_folder;
    bool m_savePending = false;
    bool m_autoTitle = true;
    bool m_bookPending = false;
};
