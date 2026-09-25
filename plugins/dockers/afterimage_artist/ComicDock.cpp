// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#include "ComicDock.h"
#include "ArtistNative.h"
#include "ComicProject.h"
#include <QComboBox>
#include <QAbstractSpinBox>
#include <QDir>
#include <QFileDialog>
#include <QFileInfo>
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
#include <kis_selection.h>

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
    auto *order = new QHBoxLayout;
    auto *moveUp = button(tr("Move page up"), body), *moveDown = button(tr("Move page down"), body);
    order->addWidget(moveUp); order->addWidget(moveDown); layout->addLayout(order);
    m_title = new QLineEdit(tr("Page 01"), body); m_title->setAccessibleName(tr("Page title")); layout->addWidget(m_title);
    connect(m_title, &QLineEdit::textEdited, this, [this] { m_autoTitle = false; });
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
    auto *placement = new QLabel(tr("Select an area on the page for the words. With no selection, they go near the upper-left."), body);
    placement->setWordWrap(true); layout->addWidget(placement);
    auto *letter = new QHBoxLayout;
    auto *caption = button(tr("Add caption"), body), *balloon = button(tr("Add balloon"), body);
    letter->addWidget(caption); letter->addWidget(balloon); layout->addLayout(letter);
    auto *save = button(tr("Save editable KRA…"), body); layout->addWidget(save);
    auto *exportRow = new QHBoxLayout;
    auto *png = button(tr("Export PNG…"), body), *pdf = button(tr("Export PDF…"), body);
    exportRow->addWidget(png); exportRow->addWidget(pdf); layout->addLayout(exportRow);
    auto *bookPdf = button(tr("Export saved pages as PDF…"), body); layout->addWidget(bookPdf);
    m_bookCancel = button(tr("Stop PDF export"), body); m_bookCancel->hide(); layout->addWidget(m_bookCancel);
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
    connect(moveUp, &QPushButton::clicked, this, [this] { movePage(-1); });
    connect(moveDown, &QPushButton::clicked, this, [this] { movePage(1); });
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
    connect(bookPdf, &QPushButton::clicked, this, &ComicDock::exportComic);
    connect(m_bookCancel, &QPushButton::clicked, m_native, &ArtistNative::cancelComicPdf);
    refreshPages();
}

void ComicDock::setCanvas(KoCanvasBase *canvas) { m_canvas = dynamic_cast<KisCanvas2 *>(canvas); }
KisDocument *ComicDock::document() const { return m_canvas ? m_canvas->viewManager()->document() : nullptr; }
void ComicDock::refreshPages()
{
    m_project->setText(m_folder.isEmpty() ? tr("Choose a folder to keep your comic pages together.") : m_folder);
    const QString selected = m_pages->currentItem() ? m_pages->currentItem()->data(Qt::UserRole).toString() : QString();
    m_pages->clear();
    if (m_folder.isEmpty()) return;
    const QDir folder(m_folder);
    const QStringList ordered = ComicProject::pages(m_folder);
    if (m_autoTitle)
        m_title->setText(tr("Page %1").arg(ordered.size() + 1, 2, 10, QLatin1Char('0')));
    for (int i = 0; i < ordered.size(); ++i) {
        auto *item = new QListWidgetItem(tr("%1 · %2").arg(i + 1, 2, 10, QLatin1Char('0')).arg(QFileInfo(ordered[i]).completeBaseName()), m_pages);
        item->setData(Qt::UserRole, folder.filePath(ordered[i]));
        if (item->data(Qt::UserRole).toString() == selected) m_pages->setCurrentItem(item);
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
    KisImageSP image = target->image();
    QRect region;
    if (const auto selection = image->globalSelection()) region = selection->selectedExactRect().intersected(image->bounds());
    if (region.isEmpty()) region = QRect(image->width() / 10, image->height() / 10,
        qMax(80, image->width() * 2 / 5), qMax(50, image->height() / 7)).intersected(image->bounds());
    const QByteArray svg = ArtistNative::letteringSvg(image->width(), image->height(), m_text->toPlainText(),
        m_font->currentFont().family(), m_textSize->value(), region, balloon);
    if (svg.isEmpty()) { m_status->setText(tr("Write some words and select a larger area for them.")); return; }
    m_status->setText(tr("Adding editable lettering…"));
    m_native->addVector(target, svg, balloon ? tr("Balloon") : tr("Caption"), {},
        [this](bool, const QString &message) { m_status->setText(message); });
}
void ComicDock::savePage()
{
    auto *target = document(); if (!target || m_savePending) return;
    const QString suggested = m_folder.isEmpty() ? target->objectName() + ".kra" : QDir(m_folder).filePath(target->objectName() + ".kra");
    const QString path = QFileDialog::getSaveFileName(this, tr("Save editable page"), suggested, tr("Krita document (*.kra)"));
    if (path.isEmpty()) return;
    const QString folder = m_folder.isEmpty() ? QFileInfo(path).absolutePath() : m_folder;
    m_savePending = true;
    m_status->setText(tr("Saving editable page…"));
    m_native->saveComicPage(target, path, folder, [this, folder](bool success, const QString &message) {
        m_savePending = false;
        if (success && m_folder.isEmpty()) {
            m_folder = folder;
            QSettings("Afterimage", "Afterimage").setValue("Artist/comicFolder", m_folder);
        }
        if (success) m_autoTitle = true;
        refreshPages();
        m_status->setText(message);
    });
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

void ComicDock::movePage(int direction)
{
    const int row = m_pages->currentRow();
    QStringList ordered = ComicProject::pages(m_folder);
    const int destination = row + direction;
    if (row < 0 || destination < 0 || destination >= ordered.size()) return;
    ordered.swapItemsAt(row, destination);
    QString error;
    if (!ComicProject::saveOrder(m_folder, ordered, &error)) { m_status->setText(error); refreshPages(); return; }
    refreshPages();
    m_pages->setCurrentRow(destination);
    m_status->setText(tr("Page order saved."));
}

void ComicDock::exportComic()
{
    if (m_bookPending) return;
    if (m_folder.isEmpty()) { m_status->setText(tr("Choose a comic folder first.")); return; }
    const QStringList names = ComicProject::pages(m_folder);
    if (names.isEmpty()) { m_status->setText(tr("Save at least one KRA page in this folder.")); return; }
    const QString path = QFileDialog::getSaveFileName(this, tr("Export saved comic pages"),
        QDir(m_folder).filePath("comic.pdf"), tr("PDF document (*.pdf)"));
    if (path.isEmpty()) return;
    QStringList paths;
    for (const QString &name : names) paths.append(QDir(m_folder).filePath(name));
    m_status->setText(tr("Exporting %1 saved pages…").arg(paths.size()));
    m_bookPending = true;
    m_bookCancel->show();
    m_native->exportComicPdf(paths, path,
        [this](bool, const QString &message) { m_bookPending = false; m_bookCancel->hide(); m_status->setText(message); },
        [this](int page, int total) { m_status->setText(tr("Rendered page %1 of %2…").arg(page).arg(total)); });
}
