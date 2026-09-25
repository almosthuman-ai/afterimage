// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#include "PixelDock.h"
#include "ArtistNative.h"
#include <QCheckBox>
#include <QAbstractSpinBox>
#include <QColorDialog>
#include <QComboBox>
#include <QFileDialog>
#include <QGridLayout>
#include <QHBoxLayout>
#include <QLabel>
#include <QLineEdit>
#include <QPushButton>
#include <QPointer>
#include <QSettings>
#include <QScrollArea>
#include <QSpinBox>
#include <QTimer>
#include <QVBoxLayout>
#include <KoColor.h>
#include <KoCanvasController.h>
#include <KoCanvasControllerWidget.h>
#include <KoToolManager.h>
#include <KoZoomMode.h>
#include <KisDocument.h>
#include <KisMainWindow.h>
#include <KisViewManager.h>
#include <KisResourceServerProvider.h>
#include <KisResourceModel.h>
#include <kis_action_manager.h>
#include <kis_action.h>
#include <kis_canvas_resource_provider.h>
#include <kis_paintop_box.h>
#include <kis_image.h>

namespace {
QPushButton *button(const QString &name, QWidget *parent) { auto *b = new QPushButton(name, parent); b->setMinimumHeight(32); return b; }
QVector<QColor> initialPalette()
{
    return {"#202030", "#514560", "#867285", "#c7b9a0", "#f5e5bd", "#8f3d54", "#cc6671", "#ec9d72",
        "#eccc80", "#79977d", "#3d6e70", "#4b5f91", "#739bc2", "#b0ced0", "#fff3df", "#121620"};
}

}

PixelDock::PixelDock() : QDockWidget(tr("Pixel art")), m_native(new ArtistNative(this))
{
    auto *body = new QWidget(this);
    auto *layout = new QVBoxLayout(body);
    layout->setContentsMargins(8, 8, 8, 8);
    m_name = new QLineEdit(tr("Untitled sprite"), body);
    m_name->setAccessibleName(tr("Sprite name"));
    layout->addWidget(m_name);
    auto *size = new QHBoxLayout;
    m_width = new QSpinBox(body); m_width->setRange(1, 1000000); m_width->setValue(64); m_width->setPrefix(tr("W "));
    m_height = new QSpinBox(body); m_height->setRange(1, 1000000); m_height->setValue(64); m_height->setPrefix(tr("H "));
    size->addWidget(m_width); size->addWidget(m_height); layout->addLayout(size);
    auto *create = button(tr("Create transparent sprite"), body);
    create->setObjectName(QStringLiteral("AfterimageCreateSprite"));
    layout->addWidget(create);
    m_status = new QLabel(tr("Draw on the Pixels layer. Save as KRA to keep every layer."), body);
    m_status->setWordWrap(true); layout->addWidget(m_status);
    auto *view = new QHBoxLayout;
    m_zoom = new QComboBox(body); m_zoom->addItem(tr("100%"), 1); m_zoom->addItem(tr("200%"), 2); m_zoom->addItem(tr("400%"), 4); m_zoom->addItem(tr("800%"), 8); m_zoom->addItem(tr("1600%"), 16);
    m_zoom->setCurrentIndex(2); m_zoom->setAccessibleName(tr("Integer canvas zoom"));
    auto *applyZoom = button(tr("Zoom"), body);
    view->addWidget(m_zoom, 1); view->addWidget(applyZoom); layout->addLayout(view);
    m_grid = new QCheckBox(tr("Pixel grid"), body); m_grid->setMinimumHeight(32); layout->addWidget(m_grid);
    auto *brush = new QHBoxLayout;
    auto *onePixel = button(tr("1 px brush"), body);
    m_erase = new QCheckBox(tr("Erase"), body); m_erase->setMinimumHeight(32);
    brush->addWidget(onePixel); brush->addWidget(m_erase); layout->addLayout(brush);
    layout->addWidget(new QLabel(tr("Palette — click a color to paint with it."), body));
    auto *palette = new QWidget(body); m_paletteLayout = new QGridLayout(palette); m_paletteLayout->setContentsMargins(0, 0, 0, 0);
    m_paletteLayout->setSpacing(3); layout->addWidget(palette);
    const QStringList saved = QSettings("Afterimage", "Afterimage").value("Artist/pixelPalette").toStringList();
    for (const QString &hex : saved) if (QColor(hex).isValid()) m_palette.append(QColor(hex));
    if (m_palette.isEmpty()) m_palette = initialPalette();
    m_paletteColor = button(tr("Edit selected color…"), body); layout->addWidget(m_paletteColor);
    m_paletteColor->setProperty("index", 0);
    drawPalette();
    m_dither = new QCheckBox(tr("Ordered dither"), body); m_dither->setMinimumHeight(32); layout->addWidget(m_dither);
    auto *index = button(tr("Make editable palette layer"), body); layout->addWidget(index);
    auto *exportRow = new QHBoxLayout;
    m_exportScale = new QComboBox(body); m_exportScale->addItem(tr("Original size"), 1);
    for (int factor : {2, 3, 4, 8, 16}) m_exportScale->addItem(tr("%1× nearest").arg(factor), factor);
    m_exportMode = new QComboBox(body);
    m_exportMode->addItem(tr("RGBA PNG"), false);
    m_exportMode->addItem(tr("Indexed PNG (up to 256 colors)"), true);
    m_exportMode->setAccessibleName(tr("PNG color format"));
    layout->addWidget(m_exportMode);
    auto *exportButton = button(tr("Export PNG…"), body);
    exportRow->addWidget(m_exportScale, 1); exportRow->addWidget(exportButton); layout->addLayout(exportRow);
    layout->addStretch();
    for (auto *input : body->findChildren<QComboBox *>()) input->setMinimumHeight(32);
    for (auto *input : body->findChildren<QAbstractSpinBox *>()) input->setMinimumHeight(32);
    for (auto *input : body->findChildren<QLineEdit *>()) input->setMinimumHeight(32);
    auto *scroll = new QScrollArea(this);
    scroll->setWidgetResizable(true);
    scroll->setFrameShape(QFrame::NoFrame);
    scroll->setWidget(body);
    setWidget(scroll); setMinimumWidth(270);
    connect(create, &QPushButton::clicked, this, [this, onePixel, applyZoom] {
        auto *window = qobject_cast<KisMainWindow *>(this->window());
        auto *created = ArtistNative::create(window, m_name->text().trimmed().isEmpty() ? tr("Untitled sprite") : m_name->text().trimmed(),
            m_width->value(), m_height->value(), false);
        m_status->setText(created ? tr("Transparent sprite ready. Paint, save as KRA, or export PNG.") : tr("The sprite could not be created."));
        if (!created) return;
        const QPointer<KisDocument> owner(created);
        QTimer::singleShot(0, this, [this, owner, onePixel, applyZoom] {
            if (!owner || document() != owner.data() || !m_canvas) return;
            onePixel->click();
            auto *controller = dynamic_cast<KoCanvasControllerWidget *>(m_canvas->canvasController());
            if (!controller) return;
            const QSize viewport = controller->viewport()->size();
            const int fit = qMin((viewport.width() - 24) / owner->image()->width(),
                                 (viewport.height() - 24) / owner->image()->height());
            for (int scale : {16, 8, 4, 2, 1}) {
                if (fit >= scale) {
                    m_zoom->setCurrentIndex(m_zoom->findData(scale));
                    applyZoom->click();
                    break;
                }
            }
        });
    });
    connect(applyZoom, &QPushButton::clicked, this, [this] {
        if (m_canvas) m_canvas->canvasController()->setZoom(KoZoomMode::ZOOM_CONSTANT, m_zoom->currentData().toInt());
    });
    connect(m_grid, &QCheckBox::toggled, this, [this](bool on) {
        if (!m_canvas) return;
        if (auto *action = m_canvas->viewManager()->actionManager()->actionByName("view_pixel_grid")) action->setChecked(on);
    });
    connect(onePixel, &QPushButton::clicked, this, [this] {
        if (!m_canvas) return;
        KoToolManager::instance()->switchToolRequested("KritaShape/KisToolBrush");
        auto *model = KisResourceServerProvider::instance()->paintOpPresetServer()->resourceModel();
        auto presets = model->resourcesForFilename("u)_Pixel_Art.kpp");
        if (presets.isEmpty()) presets = model->resourcesForName("u) Pixel Art");
        if (!presets.isEmpty()) m_canvas->viewManager()->paintOpBox()->resourceSelected(presets.first());
        auto *colors = m_canvas->viewManager()->canvasResourceProvider();
        colors->setSize(1); colors->setOpacity(1); colors->setFlow(1); colors->setDisablePressure(true); colors->setEraserMode(false);
        m_erase->setChecked(false);
        m_status->setText(presets.isEmpty() ? tr("Brush is 1 px. Choose a hard-edged preset for crisp pixels.")
            : tr("Pixel Art brush is ready at 1 px."));
    });
    connect(m_erase, &QCheckBox::toggled, this, [this](bool on) {
        if (m_canvas) m_canvas->viewManager()->canvasResourceProvider()->setEraserMode(on);
    });
    connect(m_paletteColor, &QPushButton::clicked, this, [this] {
        const int index = m_paletteColor->property("index").toInt();
        if (index < 0 || index >= m_palette.size()) return;
        const QColor chosen = QColorDialog::getColor(m_palette[index], this, tr("Palette color"));
        if (!chosen.isValid()) return;
        m_palette[index] = chosen;
        QStringList saved; for (const QColor &color : m_palette) saved << color.name();
        QSettings("Afterimage", "Afterimage").setValue("Artist/pixelPalette", saved);
        drawPalette();
    });
    connect(index, &QPushButton::clicked, this, &PixelDock::quantize);
    connect(exportButton, &QPushButton::clicked, this, [this] { exportPng(m_exportScale->currentData().toInt()); });
    refresh();
}

KisDocument *PixelDock::document() const { return m_canvas ? m_canvas->viewManager()->document() : nullptr; }
void PixelDock::setCanvas(KoCanvasBase *canvas) { m_canvas = dynamic_cast<KisCanvas2 *>(canvas); refresh(); }
void PixelDock::refresh()
{
    const bool has = document() && document()->image();
    m_grid->setEnabled(has); m_zoom->setEnabled(has); m_erase->setEnabled(has);
    if (has) {
        auto *manager = m_canvas->viewManager();
        if (auto *action = manager->actionManager()->actionByName("view_pixel_grid")) {
            m_grid->blockSignals(true); m_grid->setChecked(action->isChecked()); m_grid->blockSignals(false);
        }
    }
}
void PixelDock::drawPalette()
{
    while (auto *item = m_paletteLayout->takeAt(0)) { delete item->widget(); delete item; }
    for (int i = 0; i < m_palette.size(); ++i) {
        auto *swatch = button(QString(), m_paletteLayout->parentWidget());
        swatch->setMinimumSize(32, 32);
        swatch->setStyleSheet(QString("background:%1;border:%2px solid %3;")
            .arg(m_palette[i].name()).arg(i == m_paletteColor->property("index").toInt() ? 3 : 1)
            .arg(i == m_paletteColor->property("index").toInt() ? "#f8f8f8" : "#555"));
        swatch->setToolTip(m_palette[i].name());
        m_paletteLayout->addWidget(swatch, i / 8, i % 8);
        connect(swatch, &QPushButton::clicked, this, [this, i] {
            m_paletteColor->setProperty("index", i);
            QTimer::singleShot(0, this, [this] { drawPalette(); });
            if (document()) m_canvas->viewManager()->canvasResourceProvider()->setFGColor(KoColor(m_palette[i], document()->image()->colorSpace()));
        });
    }
}
void PixelDock::quantize()
{
    KisDocument *target = document();
    if (!target || !target->image() || m_working) return;
    m_working = true;
    m_status->setText(tr("Making palette layer?"));
    m_native->paletteLayer(target, m_palette, m_dither->isChecked(), [this](bool, const QString &message) {
        m_working = false;
        m_status->setText(message);
    });
}
void PixelDock::exportPng(int scale)
{
    KisDocument *target = document(); if (!target) return;
    const QString path = QFileDialog::getSaveFileName(this, tr("Export sprite"), target->objectName() + ".png", tr("PNG image (*.png)"));
    if (path.isEmpty()) return;
    m_status->setText(tr("Exporting PNG…"));
    m_native->exportProjection(target, path, qMax(1, scale), false, m_exportMode->currentData().toBool(),
        [this](bool, const QString &message) { m_status->setText(message); });
}
