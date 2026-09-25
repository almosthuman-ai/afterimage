// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include <QDockWidget>
#include <QPointer>
#include <QVector>
#include <QColor>
#include <KoCanvasObserverBase.h>
#include <kis_canvas2.h>

class ArtistNative;
class KisDocument;
class QSpinBox;
class QLineEdit;
class QComboBox;
class QCheckBox;
class QLabel;
class QPushButton;
class QGridLayout;

class PixelDock : public QDockWidget, public KoCanvasObserverBase
{
    Q_OBJECT
public:
    PixelDock();
    QString observerName() override { return "AfterimagePixelDocker"; }
    void setCanvas(KoCanvasBase *canvas) override;
    void unsetCanvas() override { setCanvas(nullptr); }
private:
    KisDocument *document() const;
    void refresh();
    void drawPalette();
    void quantize();
    void exportPng(int scale);
    QPointer<KisCanvas2> m_canvas;
    ArtistNative *m_native;
    QSpinBox *m_width, *m_height;
    QLineEdit *m_name;
    QComboBox *m_zoom, *m_exportScale, *m_exportMode;
    QCheckBox *m_grid, *m_dither, *m_erase;
    QLabel *m_status;
    QPushButton *m_paletteColor;
    QGridLayout *m_paletteLayout;
    QVector<QColor> m_palette;
    bool m_working = false;
};
