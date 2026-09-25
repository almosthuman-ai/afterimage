// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#include "ComicDock.h"
#include "ArtistNative.h"
#include <QComboBox>
#include <QAbstractSpinBox>
#include <QDir>
#include <QFileDialog>
#include <QFontComboBox>
#include <QHBoxLayout>
#include <QLabel>
#include <QLineEdit>
#include <QListWidget>
#include <QPlainTextEdit>
#include <QPushButton>
#include <QSettings>
#include <QScrollArea>
#include <QSpinBox>
#include <QVBoxLayout>
#include <KisDocument.h>
#include <KisMainWindow.h>
#include <KisViewManager.h>
#include <kis_image.h>

namespace {
QPushButton *button(const QString &name, QWidget *parent) { auto *b = new QPushButton(name, parent); b->setMinimumHeight(32); return b; }
}

ComicDock::ComicDock() : QDockWidget(tr("Comics")), m_native(new ArtistNative(this))
{
    auto *body = new QWidget(this);
    auto *layout = new QVBoxLayout(body); layout->setContentsMargins(8, 8, 8, 8);
    m_folder = QSettings("Afterimage", "Afterimage").value("Artist/comicFolder").toString();
    auto *choose = button(tr("Choose comic folder…"), body); layout->addWidget(choose);
    m_project = new QLabel(body); m_project->setWordWrap(true); layout->addWidget(m_project);
    m_pages = new QListWidget(body); m_pages->setMinimumHeight(90); m_pages->setMaximumHeight(150);
    m_pages->setStyleSheet("QListWidget::item { min-height: 32px; }");
    m_pages->setAccessibleName(tr("Saved comic pages")); layout->addWidget(m_pages);
    m_title = new QLineEdit(tr("Page 01"), body); m_title->setAccessibleName(tr("Page title")); layout->addWidget(m_title);
    auto *dimensions = new QHBoxLayout;
    m_width = new QSpinBox(body); m_width->setRange(1, 1000000); m_width->setValue(1800); m_width->setPrefix(tr("W "));
    m_height = new QSpinBox(body); m_height->setRange(1, 1000000); m_height->setValue(2700); m_height->setPrefix(tr("H "));
    dimensions->addWidget(m_width); dimensions->addWidget(m_height); layout->addLayout(dimensions);
    auto *create = button(tr("Create page"), body); layout->addWidget(create);
    m_layout = new QComboBox(body);
    m_layout->addItem(tr("One panel"), "1x1"); m_layout->addItem(tr("Two panels"), "1x2");
    m_layout->addItem(tr("Three-panel strip"), "3x1"); m_layout->addItem(tr("Four panels"), "2x2");
    m_layout->addItem(tr("Six panels"), "2x3"); m_layout->addItem(tr("Splash and two beats"), "splash");
    m_layout->setAccessibleName(tr("Panel layout")); layout->addWidget(m_layout);
    auto *spacing = new QHBoxLayout;
    m_margin = new QSpinBox(body); m_margin->setRange(0, 1000000); m_margin->setValue(90); m_margin->setPrefix(tr("Margin "));
    m_gutter = new QSpinBox(body); m_gutter->setRange(0, 1000000); m_gutter->setValue(36); m_gutter->setPrefix(tr("Gutter "));
    spacing->addWidget(m_margin); spacing->addWidget(m_gutter); layout->addLayout(spacing);
    auto *panels = button(tr("Add or revise panel frames"), body); layout->addWidget(panels);
    layout->addWidget(new QLabel(tr("Lettering stays editable on its own vector layer."), body));
    m_text = new QPlainTextEdit(body); m_text->setPlaceholderText(tr("Caption or dialogue")); m_text->setFixedHeight(65); layout->addWidget(m_text);
    auto *type = new QHBoxLayout;
    m_font = new QFontComboBox(body); m_font->setAccessibleName(tr("Lettering font"));
    m_textSize = new QSpinBox(body); m_textSize->setRange(1, 100000); m_textSize->setValue(52); m_textSize->setPrefix(tr("Size "));
    type->addWidget(m_font, 2); type->addWidget(m_textSize, 1); layout->addLayout(type);
    auto *position = new QHBoxLayout;
    m_x = new QSpinBox(body); m_x->setRange(0, 1000000); m_x->setValue(120); m_x->setPrefix(tr("X "));
    m_y = new QSpinBox(body); m_y->setRange(0, 1000000); m_y->setValue(180); m_y->setPrefix(tr("Y "));
    position->addWidget(m_x); position->addWidget(m_y); layout->addLayout(position);
    auto *letter = new QHBoxLayout;
    auto *caption = button(tr("Add caption"), body), *balloon = button(tr("Add balloon"), body);
    letter->addWidget(caption); letter->addWidget(balloon); layout->addLayout(letter);
    auto *save = button(tr("Save editable KRA…"), body); layout->addWidget(save);
    auto *exportRow = new QHBoxLayout;
    auto *png = button(tr("Export PNG…"), body), *pdf = button(tr("Export PDF…"), body);
    exportRow->addWidget(png); exportRow->addWidget(pdf); layout->addLayout(exportRow);
    m_status = new QLabel(tr("Draw on Artwork. Panels and words stay on separate editable layers."), body);
    m_status->setWordWrap(true); layout->addWidget(m_status); layout->addStretch();
    for (auto *input : body->findChildren<QComboBox *>()) input->setMinimumHeight(32);
    for (auto *input : body->findChildren<QAbstractSpinBox *>()) input->setMinimumHeight(32);
    for (auto *input : body->findChildren<QLineEdit *>()) input->setMinimumHeight(32);
    auto *scroll = new QScrollArea(this);
    scroll->setWidgetResizable(true);
    scroll->setHorizontalScrollBarPolicy(Qt::ScrollBarAlwaysOff);
    scroll->setFrameShape(QFrame::NoFrame);
    scroll->setWidget(body);
    setWidget(scroll); setMinimumWidth(300);
    connect(choose, &QPushButton::clicked, this, [this] {
        const QString folder = QFileDialog::getExistingDirectory(this, tr("Comic folder"), m_folder);
        if (folder.isEmpty()) return;
        m_folder = folder; QSettings("Afterimage", "Afterimage").setValue("Artist/comicFolder", m_folder); refreshPages();
    });
    connect(m_pages, &QListWidget::itemActivated, this, [this](QListWidgetItem *item) {
        if (auto *window = qobject_cast<KisMainWindow *>(this->window())) window->openDocument(item->data(Qt::UserRole).toString(), KisMainWindow::None);
    });
    connect(create, &QPushButton::clicked, this, [this] {
        auto *window = qobject_cast<KisMainWindow *>(this->window());
        auto *created = ArtistNative::create(window, m_title->text().trimmed().isEmpty() ? tr("Untitled page") : m_title->text().trimmed(),
            m_width->value(), m_height->value(), true);
        m_status->setText(created ? tr("Page ready. Add panels, draw, and save the editable KRA.") : tr("The page could not be created."));
    });
    connect(panels, &QPushButton::clicked, this, &ComicDock::applyPanels);
    connect(caption, &QPushButton::clicked, this, [this] { addLettering(false); });
    connect(balloon, &QPushButton::clicked, this, [this] { addLettering(true); });
    connect(save, &QPushButton::clicked, this, &ComicDock::savePage);
    connect(png, &QPushButton::clicked, this, [this] { exportPage(false); });
    connect(pdf, &QPushButton::clicked, this, [this] { exportPage(true); });
    refreshPages();
}

void ComicDock::setCanvas(KoCanvasBase *canvas) { m_canvas = dynamic_cast<KisCanvas2 *>(canvas); }
KisDocument *ComicDock::document() const { return m_canvas ? m_canvas->viewManager()->document() : nullptr; }
void ComicDock::refreshPages()
{
    m_project->setText(m_folder.isEmpty() ? tr("Choose a folder to keep your comic pages together.") : m_folder);
    m_pages->clear();
    if (m_folder.isEmpty()) return;
    const QDir folder(m_folder);
    for (const auto &entry : folder.entryInfoList({"*.kra"}, QDir::Files, QDir::Name)) {
        auto *item = new QListWidgetItem(entry.completeBaseName(), m_pages);
        item->setData(Qt::UserRole, entry.absoluteFilePath());
    }
}

void ComicDock::applyPanels()
{
    auto *target = document(); if (!target || !target->image()) { m_status->setText(tr("Open a page first.")); return; }
    const auto svg = ArtistNative::panelSvg(target->image()->width(), target->image()->height(), m_layout->currentData().toString(), m_margin->value(), m_gutter->value());
    if (svg.isEmpty()) { m_status->setText(tr("Margins and gutters leave no room for these panels.")); return; }
    m_status->setText(tr("Placing editable panel frames…"));
    m_native->addVector(target, svg, tr("Panels · %1").arg(m_layout->currentText()), tr("Panels · "),
        [this](bool, const QString &message) { m_status->setText(message); });
}

void ComicDock::addLettering(bool balloon)
{
    auto *target = document(); if (!target || !target->image()) { m_status->setText(tr("Open a page first.")); return; }
    const QByteArray svg = ArtistNative::letteringSvg(target->image()->width(), target->image()->height(), m_text->toPlainText(), m_font->currentFont().family(), m_textSize->value(), m_x->value(), m_y->value(), balloon);
    if (svg.isEmpty()) { m_status->setText(tr("Write dialogue and choose a position inside the page.")); return; }
    m_status->setText(tr("Adding editable lettering…"));
    m_native->addVector(target, svg, balloon ? tr("Balloon") : tr("Caption"), {},
        [this](bool, const QString &message) { m_status->setText(message); });
}
void ComicDock::savePage()
{
    auto *target = document(); if (!target) return;
    const QString suggested = m_folder.isEmpty() ? target->objectName() + ".kra" : QDir(m_folder).filePath(target->objectName() + ".kra");
    const QString path = QFileDialog::getSaveFileName(this, tr("Save editable page"), suggested, tr("Krita document (*.kra)"));
    if (path.isEmpty()) return;
    m_status->setText(target->saveAs(path, "application/x-krita", true) ? tr("Editable page saved.") : tr("The page could not be saved."));
    refreshPages();
}
void ComicDock::exportPage(bool pdf)
{
    auto *target = document(); if (!target) return;
    const QString ext = pdf ? ".pdf" : ".png";
    const QString path = QFileDialog::getSaveFileName(this, pdf ? tr("Export page PDF") : tr("Export page PNG"),
        target->objectName() + ext, pdf ? tr("PDF document (*.pdf)") : tr("PNG image (*.png)"));
    if (path.isEmpty()) return;
    m_status->setText(tr("Rendering page…"));
    m_native->exportProjection(target, path, 1, pdf, false, [this](bool, const QString &message) { m_status->setText(message); });
}
