// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#include "TempleDock.h"
#include "TempleRecipe.h"
#include "TempleService.h"
#include "TemplePalette.h"
#include "TempleStudioHost.h"
#include <KisDocument.h>
#include <KisViewManager.h>
#include <kis_canvas2.h>
#include <QCheckBox>
#include <QColorDialog>
#include <QComboBox>
#include <QDoubleSpinBox>
#include <QDateTime>
#include <QFile>
#include <QFileDialog>
#include <QFileInfo>
#include <QFormLayout>
#include <QGridLayout>
#include <QGroupBox>
#include <QHBoxLayout>
#include <QImageReader>
#include <QJsonDocument>
#include <QLabel>
#include <QLineEdit>
#include <QListWidget>
#include <QPlainTextEdit>
#include <QPushButton>
#include <QSaveFile>
#include <QStandardPaths>
#include <QScrollArea>
#include <QResizeEvent>
#include <QSizePolicy>
#include <QSettings>
#include <QSignalBlocker>
#include <QSpinBox>
#include <QTabWidget>
#include <QTimer>
#include <QUuid>
#include <QVBoxLayout>
#include <cmath>
#include <algorithm>
#include <memory>

namespace {
class TemplePreviewLabel : public QLabel {
public:
    using QLabel::QLabel;
    void setImage(const QImage &image) {
        m_original = QPixmap::fromImage(image);
        fitImage();
    }
protected:
    void resizeEvent(QResizeEvent *event) override {
        QLabel::resizeEvent(event);
        fitImage();
    }
private:
    void fitImage() {
        if (m_original.isNull()) return;
        QLabel::setPixmap(m_original.scaled(contentsRect().size(), Qt::KeepAspectRatio, Qt::SmoothTransformation));
    }
    QPixmap m_original;
};
QPushButton *button(const QString &label, QWidget *parent) {
    auto *widget = new QPushButton(label, parent);
    widget->setMinimumHeight(32);
    return widget;
}
QWidget *row(QWidget *parent, const QList<QWidget *> &items) {
    auto *widget = new QWidget(parent);
    auto *layout = new QHBoxLayout(widget);
    layout->setContentsMargins(0, 0, 0, 0);
    for (auto *item : items) layout->addWidget(item);
    return widget;
}
QJsonObject replaceAt(const QJsonObject &recipe, const QString &key, int index, const QJsonObject &object) {
    QJsonObject next = recipe;
    auto entries = next[key].toArray();
    if (index >= 0 && index < entries.size()) { entries.replace(index, object); next[key] = entries; }
    return next;
}
QString colorName(int packed) { return QColor::fromRgb(packed & 0xffffff).name(QColor::HexRgb).toUpper(); }
int packedColor(const QColor &color) { return (color.red() << 16) | (color.green() << 8) | color.blue(); }
QWidget *scrollPanel(QWidget *contents, QWidget *parent) {
    auto *scroll = new QScrollArea(parent);
    scroll->setWidgetResizable(true);
    scroll->setFrameShape(QFrame::NoFrame);
    scroll->setWidget(contents);
    return scroll;
}
QJsonValue replacePath(QJsonValue current, const QStringList &path, int depth, const QJsonValue &replacement) {
    if (depth == path.size()) return replacement;
    if (current.isArray()) {
        auto array = current.toArray();
        bool valid = false; const int index = path[depth].toInt(&valid);
        if (valid && index >= 0 && index < array.size()) array.replace(index, replacePath(array[index], path, depth + 1, replacement));
        return array;
    }
    auto object = current.toObject();
    object[path[depth]] = replacePath(object[path[depth]], path, depth + 1, replacement);
    return object;
}
QStringList optionsFor(const QString &key) {
    if (key == "method") return {"bubble", "insertion", "selection", "merge", "permute", "scatter", "roll", "heap", "shell", "quick", "smooth", "one-color", "color-bands", "glimmer"};
    if (key == "territory") return {"whole", "light", "dark", "edges", "red", "orange", "yellow", "green", "cyan", "blue", "pink", "body", "white", "black", "gray", "colorful", "midtones"};
    if (key == "signal") return {"red", "green", "blue", "hue", "saturation", "brightness", "white", "black", "gray", "luma", "chroma"};
    if (key == "resolution") return {"pixel", "fixed", "wake"};
    if (key == "action") return {"sort", "sort-outline", "wand"};
    if (key == "direction") return {"left", "right", "up", "down"};
    if (key == "targetMemory" || key == "bodyTargetMemory") return {"source", "current", "held"};
    if (key == "path") return {"rows", "columns", "snake", "clustered"};
    if (key == "reconstruction") return {"fold", "wrap", "clip", "reflect"};
    if (key == "colorSpace") return {"rgb", "hsb"};
    if (key == "channels") return {"together", "separate"};
    if (key == "composition") return {"field", "inlay"};
    if (key == "inkMode") return {"source", "palette", "chosen"};
    if (key == "placement") return {"whole", "body", "outline", "outside"};
    if (key == "glyphLogic") return {"mass", "repeat", "bones", "hybrid"};
    if (key == "alphabetOrder") return {"entered", "measured"};
    if (key == "flow") return {"organic", "rings", "rays", "grid"};
    if (key == "body") return {"figure", "infantry-dove", "image", "where", "knot"};
    if (key == "phraseLogic") return {"alternate", "noise", "near-far", "image"};
    if (key == "loopMode") return {"held", "orbit", "breathe", "collapse", "metamorphose"};
    if (key == "mutationMode") return {"held", "drift", "fracture"};
    if (key == "spatialLogic") return {"weave", "syllable", "call-response"};
    if (key == "tileLogic") return {"image", "infection", "gravity"};
    return {};
}
}

TempleDock::TempleDock() : QDockWidget(tr("Glitch Temple")) {
    setProperty("ShowOnWelcomePage", true);
    QSettings settings(QStringLiteral("Afterimage"), QStringLiteral("Afterimage"));
    const auto saved = QJsonDocument::fromJson(settings.value("Temple/workingRecipe").toByteArray()).object();
    QString error;
    m_recipe = TempleRecipe::validate(saved, &error) ? saved : TempleRecipe::initial();
    auto *root = new QWidget(this);
    auto *whole = new QVBoxLayout(root);
    whole->setContentsMargins(8, 8, 8, 8);
    m_document = new QLabel(tr("Open artwork to begin"), root);
    m_document->setWordWrap(true);
    whole->addWidget(m_document);
    auto *openFullStudio = button(tr("Open full Studio"), root);
    whole->addWidget(openFullStudio);
    auto *tabs = new QTabWidget(root);
    // A specialist recipe can have hundreds of controls. Keep the preview and
    // explicit actions visible while the tabs scroll inside the available dock.
    auto *tabScroll = new QScrollArea(root);
    tabScroll->setWidgetResizable(true);
    tabScroll->setFrameShape(QFrame::NoFrame);
    tabScroll->setSizePolicy(QSizePolicy::Preferred, QSizePolicy::Expanding);
    tabScroll->setMinimumHeight(180);
    tabScroll->setWidget(tabs);
    whole->addWidget(tabScroll, 1);
    connect(openFullStudio, &QPushButton::clicked, this, [this, tabs] {
        if (m_studio) { m_studio->showNormal(); m_studio->raise(); m_studio->activateWindow(); return; }
        KisDocument *bound = currentDocument();
        if (!bound) { m_status->setText(tr("Open artwork before opening the full Temple Studio.")); return; }
        auto *studio = new TempleStudioHost(bound, m_recipe);
        m_studio = studio;
        tabs->setEnabled(false);
        connect(studio, &TempleStudioHost::recipeChanged, this, [this](const QJsonObject &recipe) {
            updateRecipe(recipe);
        });
        connect(studio, &QObject::destroyed, this, [this, tabs] {
            m_studio = nullptr;
            tabs->setEnabled(true);
            refreshProcessList(); refreshFormList(); refreshMaterials(); refreshEffectEditor();
            refreshFormEditor(); refreshPalette(); refreshScore();
        });
        studio->show();
    });

    auto *chain = new QWidget(tabs);
    auto *chainLayout = new QVBoxLayout(chain);
    m_library = new QComboBox(chain);
    for (const auto &value : TempleRecipe::catalog()["effects"].toArray()) {
        const auto process = value.toObject();
        m_library->addItem(process["name"].toString(), process["type"].toString());
    }
    auto *addProcess = button(tr("Add process"), chain);
    chainLayout->addWidget(row(chain, {m_library, addProcess}));
    m_processes = new QListWidget(chain);
    m_processes->setMinimumHeight(130);
    chainLayout->addWidget(m_processes);
    auto *moveUp = button(tr("Up"), chain), *moveDown = button(tr("Down"), chain);
    auto *bypass = button(tr("Bypass / enable"), chain), *remove = button(tr("Remove"), chain);
    chainLayout->addWidget(row(chain, {moveUp, moveDown, bypass, remove}));
    m_effectSearch = new QLineEdit(chain);
    m_effectSearch->setPlaceholderText(tr("Find a control"));
    chainLayout->addWidget(m_effectSearch);
    m_effectEditor = new QWidget(chain);
    auto *effectHolder = new QVBoxLayout(m_effectEditor);
    effectHolder->setContentsMargins(0, 0, 0, 0);
    chainLayout->addWidget(scrollPanel(m_effectEditor, chain), 1);
    tabs->addTab(chain, tr("Glitch"));

    auto *form = new QWidget(tabs);
    auto *formLayout = new QVBoxLayout(form);
    m_formFamily = new QComboBox(form);
    m_formFamily->addItem(tr("KONE / plant"), "kone");
    m_formFamily->addItem(tr("Knot"), "knot");
    m_formFamily->addItem(tr("Human / symbols"), "human");
    auto *addForm = button(tr("Add form"), form);
    formLayout->addWidget(row(form, {m_formFamily, addForm}));
    m_forms = new QListWidget(form);
    m_forms->setMinimumHeight(110);
    formLayout->addWidget(m_forms);
    auto *formUp = button(tr("Up"), form), *formDown = button(tr("Down"), form);
    auto *formBypass = button(tr("Bypass / enable"), form), *formRemove = button(tr("Remove"), form);
    formLayout->addWidget(row(form, {formUp, formDown, formBypass, formRemove}));
    m_formSearch = new QLineEdit(form);
    m_formSearch->setPlaceholderText(tr("Find anatomy, pose or placement"));
    formLayout->addWidget(m_formSearch);
    m_formEditor = new QWidget(form);
    auto *formHolder = new QVBoxLayout(m_formEditor);
    formHolder->setContentsMargins(0, 0, 0, 0);
    formLayout->addWidget(scrollPanel(m_formEditor, form), 1);
    tabs->addTab(form, tr("FORM"));

    auto *palette = new QWidget(tabs);
    auto *paletteLayout = new QVBoxLayout(palette);
    paletteLayout->addWidget(new QLabel(tr("Four colors carried through the recipe"), palette));
    auto *swatches = new QWidget(palette);
    auto *swatchLayout = new QGridLayout(swatches);
    for (int index = 0; index < 4; ++index) {
        auto *swatch = button(QString(), swatches);
        swatch->setObjectName(QStringLiteral("templeSwatch%1").arg(index));
        swatch->setMinimumWidth(80);
        swatchLayout->addWidget(swatch, index / 2, index % 2);
        connect(swatch, &QPushButton::clicked, this, [this, index] {
            auto colors = m_recipe["palette"].toArray();
            const QColor chosen = QColorDialog::getColor(QColor::fromRgb(colors[index].toInt()), this, tr("Temple color"));
            if (!chosen.isValid()) return;
            colors.replace(index, packedColor(chosen));
            auto next = m_recipe; next["palette"] = colors; updateRecipe(next); refreshPalette();
        });
    }
    paletteLayout->addWidget(swatches);
    for (int index = 0; index < 4; ++index) {
        auto *lock = new QCheckBox(tr("Lock %1").arg(index + 1), palette);
        lock->setObjectName(QStringLiteral("templeLock%1").arg(index));
        paletteLayout->addWidget(lock);
        connect(lock, &QCheckBox::toggled, this, [this, index](bool checked) {
            auto next = m_recipe; auto form = next["koneForm"].toObject(); auto values = form["parameters"].toObject();
            values[QStringLiteral("printLock%1").arg(index)] = checked ? 1 : 0;
            form["parameters"] = values; next["koneForm"] = form;
            auto forms = next["formStack"].toArray();
            for (int i = 0; i < forms.size(); ++i) if (forms[i].toObject()["id"] == next["formSelected"]) {
                auto entry = forms[i].toObject(); entry["form"] = form; forms.replace(i, entry);
            }
            next["formStack"] = forms; updateRecipe(next);
        });
    }
    auto useColors = [this](QJsonArray candidate) {
        auto next = m_recipe; auto colors = next["palette"].toArray();
        const auto params = next["koneForm"].toObject()["parameters"].toObject();
        for (int i = 0; i < 4 && i < candidate.size(); ++i)
            if (params[QStringLiteral("printLock%1").arg(i)].toInt() < 1) colors.replace(i, candidate[i]);
        next["palette"] = colors; updateRecipe(next); refreshPalette();
    };
    auto *swap = button(tr("Swap unlocked roles"), palette);
    paletteLayout->addWidget(swap);
    connect(swap, &QPushButton::clicked, this, [this, useColors] {
        const auto original = m_recipe["palette"].toArray();
        auto colors = original;
        const auto params = m_recipe["koneForm"].toObject()["parameters"].toObject();
        QList<int> free;
        for (int i = 0; i < 4; ++i) if (params[QStringLiteral("printLock%1").arg(i)].toInt() < 1) free.append(i);
        for (int i = 0; i < free.size(); ++i) colors.replace(free[i], original[free[(i + 1) % free.size()]]);
        useColors(colors);
    });
    auto *presets = new QListWidget(palette);
    presets->setMinimumHeight(115);
    auto *searchPalettes = new QLineEdit(palette);
    searchPalettes->setPlaceholderText(tr("Search Temple color sets"));
    paletteLayout->addWidget(searchPalettes);
    paletteLayout->addWidget(presets);
    auto refillPalettes = [presets](const QString &query) {
        presets->clear();
        for (const auto &value : TempleRecipe::catalog()["palettes"].toArray()) {
            const auto set = value.toObject();
            const QString title = set["family"].toString() + " · " + set["name"].toString();
            if (!query.isEmpty() && !title.contains(query, Qt::CaseInsensitive)) continue;
            auto *item = new QListWidgetItem(title, presets);
            item->setData(Qt::UserRole, set["colors"].toArray().toVariantList());
        }
    };
    refillPalettes({});
    connect(searchPalettes, &QLineEdit::textChanged, this, refillPalettes);
    connect(presets, &QListWidget::itemClicked, this, [useColors](QListWidgetItem *item) {
        useColors(QJsonArray::fromVariantList(item->data(Qt::UserRole).toList()));
    });
    auto *relationship = new QComboBox(palette);
    for (const auto &pair : QList<QPair<QString, QString>>{{"mono", tr("One hue")}, {"analogous", tr("Neighbors")},
        {"complementary", tr("Opposites")}, {"split", tr("Split opposites")},
        {"triadic", tr("Three-way")}, {"tension", tr("Friction")}})
        relationship->addItem(pair.second, pair.first);
    paletteLayout->addWidget(row(palette, {new QLabel(tr("Relationship"), palette), relationship}));
    auto *hue = new QDoubleSpinBox(palette); hue->setRange(0, 360); hue->setValue(22);
    auto *chroma = new QDoubleSpinBox(palette); chroma->setRange(0, .3); chroma->setDecimals(3); chroma->setSingleStep(.005); chroma->setValue(.16);
    auto *contrast = new QDoubleSpinBox(palette); contrast->setRange(0, 1); contrast->setSingleStep(.01); contrast->setValue(.62);
    auto *darkGround = new QCheckBox(tr("Dark ground"), palette); darkGround->setChecked(true);
    paletteLayout->addWidget(row(palette, {new QLabel(tr("Hue"), palette), hue}));
    paletteLayout->addWidget(row(palette, {new QLabel(tr("Color intensity"), palette), chroma}));
    paletteLayout->addWidget(row(palette, {new QLabel(tr("Light / dark"), palette), contrast}));
    paletteLayout->addWidget(darkGround);
    auto *generate = button(tr("Use generated colors"), palette);
    paletteLayout->addWidget(generate);
    connect(generate, &QPushButton::clicked, this, [relationship, hue, chroma, contrast, darkGround, useColors] {
        useColors(TemplePalette::generate(relationship->currentData().toString(), hue->value(), chroma->value(), contrast->value(), darkGround->isChecked()));
    });
    auto *colorMode = new QComboBox(palette);
    colorMode->addItem(tr("Source color"), "source"); colorMode->addItem(tr("Temple palette"), "palette");
    colorMode->setCurrentIndex(qMax(0, colorMode->findData(m_recipe["colorMode"].toString())));
    paletteLayout->addWidget(row(palette, {new QLabel(tr("Color behavior"), palette), colorMode}));
    connect(colorMode, QOverload<int>::of(&QComboBox::currentIndexChanged), this, [this, colorMode] {
        auto next = m_recipe; next["colorMode"] = colorMode->currentData().toString(); updateRecipe(next);
    });
    paletteLayout->addStretch();
    tabs->addTab(palette, tr("Palette"));

    auto *materials = new QWidget(tabs);
    auto *materialLayout = new QVBoxLayout(materials);
    auto *sourceFit = new QComboBox(materials);
    sourceFit->addItem(tr("Fit entire source"), "contain"); sourceFit->addItem(tr("Fill canvas"), "cover");
    sourceFit->setCurrentIndex(qMax(0, sourceFit->findData(m_recipe["sourceFit"].toString())));
    materialLayout->addWidget(row(materials, {new QLabel(tr("Source fitting"), materials), sourceFit}));
    connect(sourceFit, QOverload<int>::of(&QComboBox::currentIndexChanged), this, [this, sourceFit] {
        auto next = m_recipe; next["sourceFit"] = sourceFit->currentData().toString(); updateRecipe(next);
    });
    auto *sourceGround = new QComboBox(materials);
    sourceGround->addItem(tr("Keep source ground"), "keep"); sourceGround->addItem(tr("Cut coherent corner ground"), "cutout");
    sourceGround->setCurrentIndex(qMax(0, sourceGround->findData(m_recipe["sourceBackground"].toString())));
    materialLayout->addWidget(row(materials, {new QLabel(tr("Source ground"), materials), sourceGround}));
    connect(sourceGround, QOverload<int>::of(&QComboBox::currentIndexChanged), this, [this, sourceGround] {
        auto next = m_recipe; next["sourceBackground"] = sourceGround->currentData().toString(); updateRecipe(next);
    });
    auto *presence = new QDoubleSpinBox(materials); presence->setRange(0, 1); presence->setSingleStep(.01);
    presence->setValue(m_recipe["sourcePresence"].toDouble());
    materialLayout->addWidget(row(materials, {new QLabel(tr("Source return"), materials), presence}));
    connect(presence, QOverload<double>::of(&QDoubleSpinBox::valueChanged), this, [this](double value) {
        auto next = m_recipe; next["sourcePresence"] = value; updateRecipe(next);
    });
    m_materials = new QListWidget(materials);
    m_materials->setMinimumHeight(115);
    materialLayout->addWidget(m_materials);
    auto *addMaterial = button(tr("Add image material"), materials);
    auto *removeMaterial = button(tr("Remove"), materials);
    auto *enableMaterial = button(tr("Bypass / enable"), materials);
    materialLayout->addWidget(row(materials, {addMaterial, removeMaterial, enableMaterial}));
    auto *opacity = new QDoubleSpinBox(materials); opacity->setRange(0, 1); opacity->setSingleStep(.01); opacity->setValue(1);
    materialLayout->addWidget(row(materials, {new QLabel(tr("Presence"), materials), opacity}));
    auto *blend = new QComboBox(materials);
    for (const auto &mode : {"normal", "difference", "overlay", "hard-mix", "screen", "multiply", "lighten", "darken"})
        blend->addItem(QString::fromUtf8(mode), mode);
    materialLayout->addWidget(row(materials, {new QLabel(tr("Blend"), materials), blend}));
    auto *mask = new QComboBox(materials);
    for (const auto &mode : {"whole", "checker", "stripes", "blocks", "light", "dark", "edges"})
        mask->addItem(QString::fromUtf8(mode), mode);
    materialLayout->addWidget(row(materials, {new QLabel(tr("Mask"), materials), mask}));
    auto *join = new QComboBox(materials);
    materialLayout->addWidget(row(materials, {new QLabel(tr("Join image"), materials), join}));
    auto editMaterial = [this](const std::function<void(QJsonObject &)> &change) {
        const int index = m_materials->currentRow(); auto layers = m_recipe["layers"].toArray();
        if (index < 0 || index >= layers.size()) return;
        auto layer = layers[index].toObject(); change(layer);
        auto next = replaceAt(m_recipe, "layers", index, layer); updateRecipe(next);
    };
    connect(addMaterial, &QPushButton::clicked, this, [this] {
        const QString path = QFileDialog::getOpenFileName(this, tr("Add Temple image material"), QString(), tr("Images (*.png *.jpg *.jpeg *.webp)"));
        if (path.isEmpty() || !QImageReader(path).canRead()) { m_status->setText(tr("Choose a readable image.")); return; }
        const QString folder = QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation) + "/temple/materials";
        if (!QDir().mkpath(folder)) { m_status->setText(tr("Temple's material vault is unavailable.")); return; }
        const QString id = QUuid::createUuid().toString(QUuid::WithoutBraces);
        const QString retained = folder + "/" + id + "." + QFileInfo(path).suffix().toLower();
        if (!QFile::copy(path, retained)) { m_status->setText(tr("Could not retain the image material.")); return; }
        auto next = m_recipe; auto layers = next["layers"].toArray();
        layers.append(QJsonObject{{"id", id}, {"label", QFileInfo(path).completeBaseName()}, {"filePath", retained},
            {"enabled", true}, {"opacity", 1}, {"blendMode", "normal"}, {"maskMode", "whole"},
            {"maskScale", 48}, {"seed", int(QDateTime::currentMSecsSinceEpoch() % 2000000000)}});
        next["layers"] = layers; updateRecipe(next); refreshMaterials(); m_materials->setCurrentRow(layers.size() - 1);
    });
    connect(removeMaterial, &QPushButton::clicked, this, [this] {
        auto layers = m_recipe["layers"].toArray(); const int index = m_materials->currentRow();
        if (index < 0 || index >= layers.size()) return;
        layers.removeAt(index); auto next = m_recipe; next["layers"] = layers; updateRecipe(next);
        refreshMaterials(); m_materials->setCurrentRow(qMin(index, layers.size() - 1));
    });
    connect(enableMaterial, &QPushButton::clicked, this, [this, editMaterial] {
        editMaterial([](QJsonObject &layer) { layer["enabled"] = !layer["enabled"].toBool(true); }); refreshMaterials();
    });
    connect(m_materials, &QListWidget::currentRowChanged, this, [this, opacity, blend, mask, join](int index) {
        const auto layers = m_recipe["layers"].toArray();
        if (index < 0 || index >= layers.size()) return;
        const auto layer = layers[index].toObject();
        { const QSignalBlocker block(opacity); opacity->setValue(layer["opacity"].toDouble(1)); }
        { const QSignalBlocker block(blend); blend->setCurrentIndex(qMax(0, blend->findData(layer["blendMode"].toString()))); }
        { const QSignalBlocker block(mask); mask->setCurrentIndex(qMax(0, mask->findData(layer["maskMode"].toString()))); }
        { const QSignalBlocker block(join); join->clear(); join->addItem(tr("Before shared processes"), "");
          for (const auto &effectValue : m_recipe["effects"].toArray()) {
              const auto effect = effectValue.toObject();
              if (effect["materialId"].toString().isEmpty()) join->addItem(tr("After %1").arg(TempleRecipe::labelFor(effect["type"].toString())), effect["id"].toString());
          }
          join->setCurrentIndex(qMax(0, join->findData(layer["joinAfter"].toString()))); }
    });
    connect(opacity, QOverload<double>::of(&QDoubleSpinBox::valueChanged), this, [editMaterial](double value) { editMaterial([value](QJsonObject &layer) { layer["opacity"] = value; }); });
    connect(blend, QOverload<int>::of(&QComboBox::currentIndexChanged), this, [editMaterial, blend](int) { editMaterial([blend](QJsonObject &layer) { layer["blendMode"] = blend->currentData().toString(); }); });
    connect(mask, QOverload<int>::of(&QComboBox::currentIndexChanged), this, [editMaterial, mask](int) { editMaterial([mask](QJsonObject &layer) { layer["maskMode"] = mask->currentData().toString(); }); });
    connect(join, QOverload<int>::of(&QComboBox::currentIndexChanged), this, [editMaterial, join](int) { editMaterial([join](QJsonObject &layer) { layer["joinAfter"] = join->currentData().toString(); }); });
    tabs->addTab(materials, tr("Materials"));

    auto *time = new QWidget(tabs);
    auto *timeLayout = new QVBoxLayout(time);
    m_phase = new QDoubleSpinBox(time); m_phase->setRange(0, .999); m_phase->setSingleStep(.025); m_phase->setDecimals(3);
    m_phase->setValue(m_recipe["scorePosition"].toDouble(0));
    connect(m_phase, QOverload<double>::of(&QDoubleSpinBox::valueChanged), this, [this](double value) {
        auto next = m_recipe; next["scorePosition"] = value; updateRecipe(next);
    });
    timeLayout->addWidget(row(time, {new QLabel(tr("Loop position"), time), m_phase}));
    auto *frames = new QSpinBox(time); frames->setRange(2, 240); frames->setValue(m_recipe["loopFrames"].toInt(36));
    auto *fps = new QSpinBox(time); fps->setRange(1, 30); fps->setValue(m_recipe["loopFps"].toInt(12));
    timeLayout->addWidget(row(time, {new QLabel(tr("Frames"), time), frames, new QLabel(tr("FPS"), time), fps}));
    connect(frames, QOverload<int>::of(&QSpinBox::valueChanged), this, [this](int value) { auto next = m_recipe; next["loopFrames"] = value; updateRecipe(next); });
    connect(fps, QOverload<int>::of(&QSpinBox::valueChanged), this, [this](int value) { auto next = m_recipe; next["loopFps"] = value; updateRecipe(next); });
    m_scoreOwner = new QComboBox(time); m_scoreControl = new QComboBox(time);
    timeLayout->addWidget(row(time, {new QLabel(tr("Animate"), time), m_scoreOwner, m_scoreControl}));
    auto *addCurve = button(tr("Add curve"), time);
    timeLayout->addWidget(addCurve);
    m_scores = new QListWidget(time); timeLayout->addWidget(m_scores, 1);
    auto *removeCurve = button(tr("Remove curve"), time); timeLayout->addWidget(removeCurve);
    m_scoreEnabled = new QCheckBox(tr("Animate selected curve"), time); timeLayout->addWidget(m_scoreEnabled);
    m_scorePoints = new QListWidget(time); timeLayout->addWidget(m_scorePoints, 1);
    m_scoreTime = new QDoubleSpinBox(time); m_scoreTime->setRange(0, 99.9); m_scoreTime->setDecimals(1); m_scoreTime->setSingleStep(.1);
    m_scoreValue = new QDoubleSpinBox(time); m_scoreValue->setRange(-100000, 100000); m_scoreValue->setDecimals(3);
    m_scoreEase = new QComboBox(time); m_scoreEase->addItem(tr("Ease"), "smooth"); m_scoreEase->addItem(tr("Steady"), "linear"); m_scoreEase->addItem(tr("Hold, then jump"), "hold");
    timeLayout->addWidget(row(time, {new QLabel(tr("Point %"), time), m_scoreTime,
        new QLabel(tr("Value"), time), m_scoreValue, m_scoreEase}));
    auto *addPoint = button(tr("Add point at loop position"), time);
    auto *removePoint = button(tr("Remove selected point"), time);
    timeLayout->addWidget(row(time, {addPoint, removePoint}));
    auto *gifButton = button(tr("Export GIF loop"), time);
    auto *mp4Button = button(tr("Export MP4 loop"), time);
    timeLayout->addWidget(row(time, {gifButton, mp4Button}));
    auto editTrack = [this](const std::function<void(QJsonObject &)> &change) {
        auto tracks = m_recipe["timeScore"].toArray(); const int index = m_scores->currentRow();
        if (index < 0 || index >= tracks.size()) return;
        auto track = tracks[index].toObject(); change(track); tracks.replace(index, track);
        auto next = m_recipe; next["timeScore"] = tracks; updateRecipe(next); refreshScore();
    };
    auto editPoint = [this, editTrack](const std::function<void(QJsonObject &)> &change) {
        const int index = m_scorePoints->currentRow();
        editTrack([index, change](QJsonObject &track) {
            auto points = track["points"].toArray(); if (index < 0 || index >= points.size()) return;
            auto point = points[index].toObject(); change(point); points.replace(index, point);
            QList<QJsonValue> ordered; for (const auto &value : points) ordered.append(value);
            std::sort(ordered.begin(), ordered.end(), [](const QJsonValue &a, const QJsonValue &b) {
                return a.toObject()["time"].toDouble() < b.toObject()["time"].toDouble();
            });
            points = {}; for (const auto &value : ordered) points.append(value);
            track["points"] = points;
        });
    };
    connect(m_scoreOwner, QOverload<int>::of(&QComboBox::currentIndexChanged), this, [this](int) { refreshScoreControls(); });
    connect(addCurve, &QPushButton::clicked, this, [this] {
        const QString owner = m_scoreOwner->currentData().toString();
        const QString parameter = m_scoreControl->currentData().toString();
        if (owner.isEmpty() || parameter.isEmpty()) return;
        const QString target = owner == "form" ? "form" : owner.startsWith("layer:") ? "layer" : "effect";
        const QString ownerId = owner == "form" ? "form" : owner.mid(owner.indexOf(':') + 1);
        auto tracks = m_recipe["timeScore"].toArray();
        for (int i = 0; i < tracks.size(); ++i) {
            const auto item = tracks[i].toObject();
            if (item["target"] == target && item["owner"] == ownerId && item["parameter"] == parameter) {
                m_scores->setCurrentRow(i); return;
            }
        }
        double value = 0;
        if (target == "form") value = m_recipe["koneForm"].toObject()["parameters"].toObject()[parameter].toDouble();
        else if (target == "layer") {
            for (const auto &entry : m_recipe["layers"].toArray()) if (entry.toObject()["id"] == ownerId)
                value = entry.toObject()["opacity"].toDouble(1);
        } else {
            for (const auto &entry : m_recipe["effects"].toArray()) if (entry.toObject()["id"] == ownerId)
                value = entry.toObject()["parameters"].toObject()[parameter].toDouble();
        }
        tracks.append(QJsonObject{{"id", QUuid::createUuid().toString(QUuid::WithoutBraces)},
            {"target", target}, {"owner", ownerId}, {"parameter", parameter}, {"enabled", true},
            {"points", QJsonArray{QJsonObject{{"time", 0}, {"value", value}, {"ease", "smooth"}},
                                  QJsonObject{{"time", .5}, {"value", value}, {"ease", "smooth"}}}}});
        auto next = m_recipe; next["timeScore"] = tracks; updateRecipe(next); refreshScore(); m_scores->setCurrentRow(tracks.size() - 1);
    });
    connect(removeCurve, &QPushButton::clicked, this, [this] {
        auto tracks = m_recipe["timeScore"].toArray(); const int index = m_scores->currentRow();
        if (index < 0 || index >= tracks.size()) return;
        tracks.removeAt(index); auto next = m_recipe; next["timeScore"] = tracks; updateRecipe(next); refreshScore();
    });
    connect(m_scores, &QListWidget::currentRowChanged, this, [this](int) { refreshScorePoints(); });
    connect(m_scorePoints, &QListWidget::currentRowChanged, this, [this](int) { refreshScorePoints(); });
    connect(m_scoreEnabled, &QCheckBox::toggled, this, [editTrack](bool enabled) {
        editTrack([enabled](QJsonObject &track) { track["enabled"] = enabled; });
    });
    connect(m_scoreTime, QOverload<double>::of(&QDoubleSpinBox::valueChanged), this, [editPoint](double percent) {
        editPoint([percent](QJsonObject &point) { point["time"] = percent / 100.0; });
    });
    connect(m_scoreValue, QOverload<double>::of(&QDoubleSpinBox::valueChanged), this, [editPoint](double value) {
        editPoint([value](QJsonObject &point) { point["value"] = value; });
    });
    connect(m_scoreEase, QOverload<int>::of(&QComboBox::currentIndexChanged), this, [editPoint, this](int) {
        editPoint([this](QJsonObject &point) { point["ease"] = m_scoreEase->currentData().toString(); });
    });
    connect(addPoint, &QPushButton::clicked, this, [this, editTrack] {
        editTrack([this](QJsonObject &track) {
            auto points = track["points"].toArray();
            const double time = m_phase->value();
            for (const auto &value : points) if (qAbs(value.toObject()["time"].toDouble() - time) < .001) return;
            const double value = points.isEmpty() ? 0 : points.first().toObject()["value"].toDouble();
            points.append(QJsonObject{{"time", time}, {"value", value}, {"ease", "smooth"}});
            QList<QJsonValue> ordered; for (const auto &item : points) ordered.append(item);
            std::sort(ordered.begin(), ordered.end(), [](const QJsonValue &a, const QJsonValue &b) {
                return a.toObject()["time"].toDouble() < b.toObject()["time"].toDouble();
            });
            points = {}; for (const auto &item : ordered) points.append(item);
            track["points"] = points;
        });
    });
    connect(removePoint, &QPushButton::clicked, this, [this, editTrack] {
        const int index = m_scorePoints->currentRow();
        editTrack([index](QJsonObject &track) {
            auto points = track["points"].toArray();
            if (index < 0 || index >= points.size() || points.size() <= 2) return;
            points.removeAt(index); track["points"] = points;
        });
    });
    auto exportFromDock = [this](const QString &format) {
        auto *document = currentDocument();
        if (!document || !document->image()) { m_status->setText(tr("Open an artwork to export a Temple loop.")); return; }
        const QString path = QFileDialog::getSaveFileName(this, tr("Export Temple loop"), QString(),
            format == "gif" ? tr("GIF loop (*.gif)") : tr("MP4 loop (*.mp4)"));
        if (path.isEmpty()) return;
        const QString documentId = TempleService::instance()->documentId(document);
        const QString id = TempleService::instance()->exportLoop(documentId, m_recipe, format, path);
        m_status->setText(tr("Rendering Temple loop…"));
        auto connection = std::make_shared<QMetaObject::Connection>();
        *connection = connect(TempleService::instance(), &TempleService::loopFinished, this,
            [this, id, connection](const QString &finishedId, const QJsonObject &result) {
                if (id != finishedId) return;
                QObject::disconnect(*connection);
                m_status->setText(result.contains("error") ? result["error"].toString()
                    : tr("Temple loop saved: %1").arg(result["path"].toString()));
            });
    };
    connect(gifButton, &QPushButton::clicked, this, [exportFromDock] { exportFromDock("gif"); });
    connect(mp4Button, &QPushButton::clicked, this, [exportFromDock] { exportFromDock("mp4"); });
    tabs->addTab(time, tr("Time"));
    connect(tabs, &QTabWidget::currentChanged, this, [this, tabs, time](int) {
        if (tabs->currentWidget() == time) refreshScore();
    });

    auto *recipe = new QWidget(tabs);
    auto *recipeLayout = new QVBoxLayout(recipe);
    recipeLayout->addWidget(new QLabel(tr("Recipes retain the full Temple schema, including nested material and time settings."), recipe));
    auto *save = button(tr("Export recipe"), recipe), *load = button(tr("Open recipe"), recipe);
    recipeLayout->addWidget(row(recipe, {save, load}));
    auto *advanced = new QPlainTextEdit(recipe);
    advanced->setPlaceholderText(tr("Full recipe JSON for precise or imported Temple settings"));
    advanced->setPlainText(QString::fromUtf8(QJsonDocument(m_recipe).toJson(QJsonDocument::Indented)));
    recipeLayout->addWidget(advanced, 1);
    auto *applyJson = button(tr("Use edited recipe"), recipe);
    recipeLayout->addWidget(applyJson);
    connect(tabs, &QTabWidget::currentChanged, this, [this, tabs, advanced, recipe](int) {
        if (tabs->currentWidget() == recipe) advanced->setPlainText(QString::fromUtf8(QJsonDocument(m_recipe).toJson(QJsonDocument::Indented)));
    });
    connect(applyJson, &QPushButton::clicked, this, [this, advanced] {
        QJsonParseError parse;
        const auto next = QJsonDocument::fromJson(advanced->toPlainText().toUtf8(), &parse).object();
        QString error;
        if (parse.error != QJsonParseError::NoError || !TempleRecipe::validate(next, &error)) {
            m_status->setText(error.isEmpty() ? parse.errorString() : error); return;
        }
        updateRecipe(next); refreshProcessList(); refreshFormList(); refreshMaterials(); refreshEffectEditor(); refreshFormEditor(); refreshPalette(); refreshScore();
    });
    connect(save, &QPushButton::clicked, this, [this] {
        const QString path = QFileDialog::getSaveFileName(this, tr("Export Temple recipe"), QString(), tr("Temple recipe (*.json)"));
        if (path.isEmpty()) return;
        QSaveFile file(path);
        if (!file.open(QIODevice::WriteOnly) || file.write(QJsonDocument(m_recipe).toJson(QJsonDocument::Indented)) < 0 || !file.commit())
            m_status->setText(tr("Could not export the recipe."));
    });
    connect(load, &QPushButton::clicked, this, [this] {
        const QString path = QFileDialog::getOpenFileName(this, tr("Open Temple recipe"), QString(), tr("Temple recipe (*.json)"));
        if (path.isEmpty()) return;
        QFile file(path); if (!file.open(QIODevice::ReadOnly)) return;
        const auto next = QJsonDocument::fromJson(file.readAll()).object();
        QString error;
        if (!TempleRecipe::validate(next, &error)) { m_status->setText(error); return; }
        updateRecipe(next); refreshProcessList(); refreshFormList(); refreshMaterials(); refreshEffectEditor(); refreshFormEditor(); refreshPalette(); refreshScore();
    });
    tabs->addTab(recipe, tr("Recipe"));

    m_preview = new TemplePreviewLabel(root);
    m_preview->setFixedHeight(150);
    m_preview->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    m_preview->setAlignment(Qt::AlignCenter);
    m_preview->setText(tr("Preview appears here"));
    whole->addWidget(m_preview);
    auto *previewButton = button(tr("Preview"), root);
    auto *fullButton = button(tr("Render full size"), root);
    auto *applyButton = button(tr("Apply to artwork"), root);
    whole->addWidget(row(root, {previewButton, fullButton, applyButton}));
    m_status = new QLabel(root);
    m_status->setWordWrap(true);
    m_status->setText(tr("Ready"));
    whole->addWidget(m_status);
    setWidget(root);
    m_previewTimer = new QTimer(this);
    m_previewTimer->setSingleShot(true);
    m_previewTimer->setInterval(800);
    connect(m_previewTimer, &QTimer::timeout, this, [this] { beginPreview(false, false); });
    connect(previewButton, &QPushButton::clicked, this, [this] { beginPreview(false, false); });
    connect(fullButton, &QPushButton::clicked, this, [this] { beginPreview(true, false); });
    connect(applyButton, &QPushButton::clicked, this, [this] { beginPreview(true, true); });
    connect(TempleService::instance(), &TempleService::renderFinished, this, &TempleDock::renderFinished);
    connect(TempleService::instance(), &TempleService::applyFinished, this, &TempleDock::applyFinished);

    connect(addProcess, &QPushButton::clicked, this, [this] {
        auto effect = TempleRecipe::createEffect(m_library->currentData().toString());
        if (effect.isEmpty()) return;
        auto next = m_recipe; auto entries = next["effects"].toArray(); entries.append(effect); next["effects"] = entries;
        next["processStage"] = "chain"; updateRecipe(next); refreshProcessList(); m_processes->setCurrentRow(entries.size() - 1);
    });
    connect(m_processes, &QListWidget::currentRowChanged, this, [this] { refreshEffectEditor(); });
    auto moveProcess = [this](int direction) {
        auto entries = m_recipe["effects"].toArray(); const int old = m_processes->currentRow(), target = old + direction;
        if (old < 0 || target < 0 || target >= entries.size()) return;
        const auto value = entries[old]; entries.replace(old, entries[target]); entries.replace(target, value);
        auto next = m_recipe; next["effects"] = entries; updateRecipe(next); refreshProcessList(); m_processes->setCurrentRow(target);
    };
    connect(moveUp, &QPushButton::clicked, this, [moveProcess] { moveProcess(-1); });
    connect(moveDown, &QPushButton::clicked, this, [moveProcess] { moveProcess(1); });
    connect(bypass, &QPushButton::clicked, this, [this] {
        editEffect([](QJsonObject &effect) { effect["enabled"] = !effect["enabled"].toBool(true); }); refreshProcessList();
    });
    connect(remove, &QPushButton::clicked, this, [this] {
        auto entries = m_recipe["effects"].toArray(); const int index = m_processes->currentRow();
        if (index < 0 || index >= entries.size()) return;
        entries.removeAt(index); auto next = m_recipe; next["effects"] = entries; updateRecipe(next);
        refreshProcessList(); m_processes->setCurrentRow(qMin(index, entries.size() - 1));
    });
    connect(m_effectSearch, &QLineEdit::textChanged, this, [this] { refreshEffectEditor(); });

    connect(addForm, &QPushButton::clicked, this, [this] {
        auto next = m_recipe; auto entries = next["formStack"].toArray();
        if (entries.isEmpty() && next["processStage"] == "form") {
            entries.append(QJsonObject{{"id", "original-form"}, {"label", "Original form"},
                {"enabled", true}, {"form", next["koneForm"]}});
        }
        const auto formState = TempleRecipe::createForm(m_formFamily->currentData().toString());
        const QString id = QUuid::createUuid().toString(QUuid::WithoutBraces);
        entries.append(QJsonObject{{"id", id}, {"label", m_formFamily->currentText()}, {"enabled", true}, {"form", formState}});
        next["formStack"] = entries; next["formSelected"] = id; next["koneForm"] = formState;
        next["baseMode"] = "kone"; next["processStage"] = "form";
        updateRecipe(next); refreshFormList(); m_forms->setCurrentRow(entries.size() - 1);
    });
    connect(m_forms, &QListWidget::currentRowChanged, this, [this](int index) {
        const auto entries = m_recipe["formStack"].toArray();
        if (index >= 0 && index < entries.size()) {
            auto next = m_recipe; const auto entry = entries[index].toObject();
            next["formSelected"] = entry["id"]; next["koneForm"] = entry["form"]; m_recipe = next;
        }
        refreshFormEditor();
    });
    auto moveForm = [this](int direction) {
        auto entries = m_recipe["formStack"].toArray(); const int old = m_forms->currentRow(), target = old + direction;
        if (old < 0 || target < 0 || target >= entries.size()) return;
        const auto value = entries[old]; entries.replace(old, entries[target]); entries.replace(target, value);
        auto next = m_recipe; next["formStack"] = entries; updateRecipe(next); refreshFormList(); m_forms->setCurrentRow(target);
    };
    connect(formUp, &QPushButton::clicked, this, [moveForm] { moveForm(-1); });
    connect(formDown, &QPushButton::clicked, this, [moveForm] { moveForm(1); });
    connect(formBypass, &QPushButton::clicked, this, [this] {
        auto entries = m_recipe["formStack"].toArray(); const int index = m_forms->currentRow();
        if (index < 0 || index >= entries.size()) return;
        auto entry = entries[index].toObject(); entry["enabled"] = !entry["enabled"].toBool(true); entries.replace(index, entry);
        auto next = m_recipe; next["formStack"] = entries; updateRecipe(next); refreshFormList(); m_forms->setCurrentRow(index);
    });
    connect(formRemove, &QPushButton::clicked, this, [this] {
        auto entries = m_recipe["formStack"].toArray(); const int index = m_forms->currentRow();
        if (index < 0 || index >= entries.size()) return;
        entries.removeAt(index); auto next = m_recipe; next["formStack"] = entries;
        if (!entries.isEmpty()) { const auto entry = entries[qMin(index, entries.size() - 1)].toObject(); next["formSelected"] = entry["id"]; next["koneForm"] = entry["form"]; }
        updateRecipe(next); refreshFormList(); m_forms->setCurrentRow(qMin(index, entries.size() - 1));
    });
    connect(m_formSearch, &QLineEdit::textChanged, this, [this] { refreshFormEditor(); });
    refreshProcessList(); refreshFormList(); refreshMaterials(); refreshEffectEditor(); refreshFormEditor(); refreshPalette(); refreshScore();
}

KisDocument *TempleDock::currentDocument() const {
    return m_canvas && m_canvas->viewManager() ? m_canvas->viewManager()->document() : nullptr;
}
void TempleDock::setCanvas(KoCanvasBase *canvas) {
    m_canvas = dynamic_cast<KisCanvas2 *>(canvas);
    const auto document = currentDocument();
    m_document->setText(document ? tr("Artwork: %1").arg(document->caption()) : tr("Open artwork to begin"));
}
void TempleDock::unsetCanvas() { setCanvas(nullptr); }

void TempleDock::updateRecipe(const QJsonObject &recipe) {
    QString error;
    const QJsonObject retained = TempleRecipe::retainMaterials(recipe, &error);
    if (!error.isEmpty()) { m_status->setText(error); return; }
    m_recipe = retained;
    m_recipe["revision"] = m_recipe["revision"].toInt(0) + 1;
    QSettings settings(QStringLiteral("Afterimage"), QStringLiteral("Afterimage"));
    settings.setValue("Temple/workingRecipe", QJsonDocument(m_recipe).toJson(QJsonDocument::Compact));
    schedulePreview();
}
void TempleDock::schedulePreview() {
    if (!currentDocument()) return;
    m_dirty = true;
    if (!m_rendering) m_previewTimer->start();
}
void TempleDock::beginPreview(bool full, bool applyAfter) {
    if (m_rendering) {
        if (full) {
            if (auto *document = currentDocument()) {
                m_pendingDocumentId = TempleService::instance()->documentId(document);
                m_pendingRecipe = m_recipe;
                m_pendingApply = applyAfter;
            }
        } else m_dirty = true;
        return;
    }
    KisDocument *document = currentDocument();
    if (!document || !document->image()) { m_status->setText(tr("Open an artwork to render the Temple recipe.")); return; }
    m_previewTimer->stop();
    m_dirty = false; m_rendering = true; m_applyAfter = applyAfter;
    m_status->setText(full ? tr("Rendering the full artwork…") : tr("Preparing a Temple preview…"));
    m_runningId = TempleService::instance()->renderRecipe(TempleService::instance()->documentId(document), m_recipe, full ? 0 : 800);
}
void TempleDock::renderFinished(const QString &id, const QJsonObject &result) {
    if (id != m_runningId) return;
    m_rendering = false;
    if (result.contains("error")) {
        m_status->setText(result["error"].toString()); m_applyAfter = false;
        if (!m_pendingDocumentId.isEmpty()) {
            const QString documentId = m_pendingDocumentId;
            const QJsonObject recipe = m_pendingRecipe;
            const bool apply = m_pendingApply;
            m_pendingDocumentId.clear(); m_pendingRecipe = {}; m_pendingApply = false;
            m_rendering = true; m_applyAfter = apply;
            m_runningId = TempleService::instance()->renderRecipe(documentId, recipe, 0);
        }
        return;
    }
    const bool full = result["fullSize"].toBool();
    if (full) m_fullId = id; else m_previewId = id;
    QImageReader reader(result["path"].toString());
    reader.setScaledSize(reader.size().scaled(800, 260, Qt::KeepAspectRatio));
    const QImage preview = reader.read();
    if (!preview.isNull()) static_cast<TemplePreviewLabel *>(m_preview)->setImage(preview);
    m_status->setText(full ? tr("Full-size Temple render ready for its original artwork.") : tr("Preview ready."));
    if (m_applyAfter && full) { m_applyAfter = false; TempleService::instance()->applyRender(id); }
    else m_applyAfter = false;
    if (!m_pendingDocumentId.isEmpty()) {
        const QString documentId = m_pendingDocumentId;
        const QJsonObject recipe = m_pendingRecipe;
        const bool apply = m_pendingApply;
        m_pendingDocumentId.clear(); m_pendingRecipe = {}; m_pendingApply = false;
        m_rendering = true; m_applyAfter = apply;
        m_runningId = TempleService::instance()->renderRecipe(documentId, recipe, 0);
        return;
    }
    if (m_dirty) {
        m_dirty = false; m_previewTimer->start();
    }
}
void TempleDock::applyFinished(const QString &id, const QJsonObject &result) {
    if (id != m_fullId) return;
    m_status->setText(result.contains("error") ? result["error"].toString() : tr("Temple render added as an undoable paint layer."));
}

void TempleDock::refreshProcessList() {
    const int selected = m_processes->currentRow();
    const QSignalBlocker blocker(m_processes);
    m_processes->clear();
    for (const auto &value : m_recipe["effects"].toArray()) {
        const auto effect = value.toObject();
        m_processes->addItem(QStringLiteral("%1%2").arg(effect["enabled"].toBool(true) ? QString() : QStringLiteral("◌ "))
            .arg(TempleRecipe::labelFor(effect["type"].toString())));
    }
    if (m_processes->count()) m_processes->setCurrentRow(qBound(0, selected, m_processes->count() - 1));
}
void TempleDock::refreshFormList() {
    const int selected = m_forms->currentRow();
    const QSignalBlocker blocker(m_forms);
    m_forms->clear();
    for (const auto &value : m_recipe["formStack"].toArray()) {
        const auto form = value.toObject();
        m_forms->addItem((form["enabled"].toBool(true) ? QString() : QStringLiteral("◌ ")) + form["label"].toString());
    }
    if (m_forms->count()) m_forms->setCurrentRow(qBound(0, selected, m_forms->count() - 1));
}
void TempleDock::refreshMaterials() {
    if (!m_materials) return;
    const int selected = m_materials->currentRow();
    const QSignalBlocker blocker(m_materials);
    m_materials->clear();
    for (const auto &value : m_recipe["layers"].toArray()) {
        const auto material = value.toObject();
        m_materials->addItem((material["enabled"].toBool(true) ? QString() : QStringLiteral("◌ ")) + material["label"].toString());
    }
    if (m_materials->count()) m_materials->setCurrentRow(qBound(0, selected, m_materials->count() - 1));
}
void TempleDock::editEffect(const std::function<void(QJsonObject &)> &change) {
    const int index = m_processes->currentRow();
    auto effects = m_recipe["effects"].toArray();
    if (index < 0 || index >= effects.size()) return;
    auto effect = effects[index].toObject(); change(effect);
    auto next = replaceAt(m_recipe, "effects", index, effect);
    updateRecipe(next);
}
void TempleDock::editEffectNested(const QStringList &path, const QJsonValue &value) {
    editEffect([path, value](QJsonObject &effect) {
        effect = replacePath(effect, path, 0, value).toObject();
    });
}
void TempleDock::editForm(const std::function<void(QJsonObject &)> &change) {
    const int index = m_forms->currentRow();
    auto forms = m_recipe["formStack"].toArray();
    if (index < 0 || index >= forms.size()) return;
    auto entry = forms[index].toObject(); auto form = entry["form"].toObject();
    change(form); entry["form"] = form;
    auto next = replaceAt(m_recipe, "formStack", index, entry);
    next["koneForm"] = form; next["formSelected"] = entry["id"];
    updateRecipe(next);
}

void TempleDock::setEditor(QWidget *container, QWidget *editor) {
    auto *layout = container->layout();
    while (auto *item = layout->takeAt(0)) { delete item->widget(); delete item; }
    layout->addWidget(editor);
}
void TempleDock::refreshEffectEditor() {
    auto *panel = new QWidget(m_effectEditor);
    auto *layout = new QVBoxLayout(panel);
    layout->setContentsMargins(0, 0, 0, 0);
    const int index = m_processes->currentRow();
    const auto effects = m_recipe["effects"].toArray();
    if (index < 0 || index >= effects.size()) { layout->addWidget(new QLabel(tr("Add or select a process."), panel)); setEditor(m_effectEditor, panel); return; }
    const auto effect = effects[index].toObject();
    QJsonObject definition;
    for (const auto &value : TempleRecipe::catalog()["effects"].toArray())
        if (value.toObject()["type"] == effect["type"]) { definition = value.toObject(); break; }
    auto *description = new QLabel(definition["description"].toString(), panel); description->setWordWrap(true);
    layout->addWidget(description);
    auto *journey = new QComboBox(panel);
    journey->addItem(tr("Joined image"), "");
    journey->addItem(tr("Base / FORM"), "base");
    for (const auto &value : m_recipe["layers"].toArray()) {
        const auto material = value.toObject();
        journey->addItem(material["label"].toString(), material["id"].toString());
    }
    const QString materialId = effect["materialId"].toString();
    if (!materialId.isEmpty() && journey->findData(materialId) < 0)
        journey->addItem(tr("Missing material · resting"), materialId);
    journey->setCurrentIndex(qMax(0, journey->findData(materialId)));
    layout->addWidget(row(panel, {new QLabel(tr("Process journey"), panel), journey}));
    connect(journey, QOverload<int>::of(&QComboBox::currentIndexChanged), this, [this, journey](int) {
        editEffect([journey](QJsonObject &item) {
            const QString id = journey->currentData().toString();
            if (id.isEmpty()) item.remove("materialId"); else item["materialId"] = id;
        });
    });
    auto *target = new QGroupBox(tr("Where this step acts"), panel);
    auto *targetLayout = new QFormLayout(target);
    auto *where = new QComboBox(target);
    for (const auto &name : {"whole", "light", "dark", "edges", "saturated", "muted", "hue", "color-kin", "found-body", "shape-relatives", "random", "checker", "stripes", "blocks"})
        where->addItem(QString::fromUtf8(name).replace('-', ' '), name);
    where->setCurrentIndex(qMax(0, where->findData(effect["where"].toObject()["mode"].toString("whole"))));
    targetLayout->addRow(tr("Territory"), where);
    auto *memory = new QComboBox(target);
    memory->addItem(tr("Arriving image"), "current"); memory->addItem(tr("Original source"), "source"); memory->addItem(tr("Held target"), "held");
    memory->setCurrentIndex(qMax(0, memory->findData(effect["where"].toObject()["targetMemory"].toString("current"))));
    targetLayout->addRow(tr("Recognize from"), memory);
    connect(where, QOverload<int>::of(&QComboBox::currentIndexChanged), this, [this, where](int) {
        editEffect([where](QJsonObject &item) { auto field = item["where"].toObject(); field["mode"] = where->currentData().toString(); item["where"] = field; });
    });
    connect(memory, QOverload<int>::of(&QComboBox::currentIndexChanged), this, [this, memory](int) {
        editEffect([memory](QJsonObject &item) { auto field = item["where"].toObject(); field["targetMemory"] = memory->currentData().toString(); item["where"] = field; });
    });
    const auto whereData = effect["where"].toObject();
    for (const auto &entry : QList<QPair<QString, QPair<double, double>>>{{"threshold", {0, 1}}, {"softness", {0, 1}},
        {"hue", {0, 360}}, {"hueWidth", {0, 180}}, {"scale", {1, 400}}, {"colorReach", {0, 1}},
        {"shadeLoyalty", {0, 1}}, {"edgeLoyalty", {0, 1}}, {"bodyExpansion", {-1, 1}}}) {
        auto *field = new QDoubleSpinBox(target); field->setRange(entry.second.first, entry.second.second);
        field->setDecimals(2); field->setSingleStep(.01); field->setValue(whereData[entry.first].toDouble());
        targetLayout->addRow(entry.first, field);
        connect(field, QOverload<double>::of(&QDoubleSpinBox::valueChanged), this, [this, name = entry.first](double value) {
            editEffect([name, value](QJsonObject &item) { auto where = item["where"].toObject(); where[name] = value; item["where"] = where; });
        });
    }
    auto *invert = new QCheckBox(tr("Invert territory"), target); invert->setChecked(whereData["invert"].toBool());
    targetLayout->addRow(invert);
    connect(invert, &QCheckBox::toggled, this, [this](bool checked) {
        editEffect([checked](QJsonObject &item) { auto where = item["where"].toObject(); where["invert"] = checked; item["where"] = where; });
    });
    layout->addWidget(target);
    auto *controls = new QGroupBox(tr("Material"), panel);
    auto *controlLayout = new QFormLayout(controls);
    const QString filter = m_effectSearch->text().trimmed();
    for (const auto &value : definition["parameters"].toArray()) {
        const auto parameter = value.toObject();
        const QString key = parameter["id"].toString(), label = parameter["label"].toString(key);
        if (!filter.isEmpty() && !key.contains(filter, Qt::CaseInsensitive) && !label.contains(filter, Qt::CaseInsensitive)) continue;
        const auto options = parameter["choices"].toArray();
        if (!options.isEmpty()) {
            auto *choice = new QComboBox(controls);
            for (int i = 0; i < options.size(); ++i) choice->addItem(options[i].toString(), i);
            choice->setCurrentIndex(qBound(0, effect["parameters"].toObject()[key].toInt(), options.size() - 1));
            choice->setToolTip(parameter["description"].toString());
            controlLayout->addRow(label, choice);
            connect(choice, QOverload<int>::of(&QComboBox::currentIndexChanged), this, [this, key](int value) {
                m_effectEditor->setProperty("lastParameter", key);
                editEffect([key, value](QJsonObject &item) { auto parameters = item["parameters"].toObject(); parameters[key] = value; item["parameters"] = parameters; });
            });
        } else {
            auto *number = new QDoubleSpinBox(controls);
            number->setRange(parameter["min"].toDouble(), parameter["max"].toDouble());
            number->setDecimals(parameter["step"].toDouble() >= 1 ? 0 : 3);
            number->setSingleStep(parameter["step"].toDouble(.01));
            number->setValue(effect["parameters"].toObject()[key].toDouble(parameter["default"].toDouble()));
            number->setToolTip(parameter["description"].toString());
            controlLayout->addRow(label, number);
            connect(number, QOverload<double>::of(&QDoubleSpinBox::valueChanged), this, [this, key](double value) {
                m_effectEditor->setProperty("lastParameter", key);
                editEffect([key, value](QJsonObject &item) { auto parameters = item["parameters"].toObject(); parameters[key] = value; item["parameters"] = parameters; });
            });
        }
    }
    if (controlLayout->rowCount() == 0) controlLayout->addRow(new QLabel(tr("Use the structure controls below."), controls));
    layout->addWidget(controls); layout->addStretch();
    std::function<void(QFormLayout *, const QJsonValue &, const QStringList &)> buildNested;
    buildNested = [this, &buildNested, panel](QFormLayout *holder, const QJsonValue &value, const QStringList &path) {
        if (value.isObject()) {
            const auto object = value.toObject();
            for (auto it = object.begin(); it != object.end(); ++it) {
                const QString key = it.key();
                if (key == "kind" || key == "id") continue;
                const auto child = it.value();
                const QStringList childPath = path + QStringList{key};
                if (child.isObject() || (child.isArray() && !child.toArray().isEmpty() && child.toArray().first().isObject())) {
                    auto *group = new QGroupBox(key, panel);
                    auto *inner = new QFormLayout(group);
                    buildNested(inner, child, childPath);
                    holder->addRow(group);
                } else buildNested(holder, child, childPath);
            }
            return;
        }
        if (value.isArray()) {
            const auto array = value.toArray();
            if (!array.isEmpty() && array.first().isObject()) {
                for (int i = 0; i < array.size(); ++i) {
                    const auto entry = array[i].toObject();
                    auto *rowGroup = new QGroupBox(entry["id"].toString(QString::number(i + 1)), panel);
                    auto *inner = new QFormLayout(rowGroup);
                    buildNested(inner, entry, path + QStringList{QString::number(i)});
                    auto *remove = button(tr("Remove row"), rowGroup);
                    inner->addRow(remove);
                    connect(remove, &QPushButton::clicked, this, [this, path, i, array] {
                        auto changed = array; changed.removeAt(i); editEffectNested(path, changed); refreshEffectEditor();
                    });
                    holder->addRow(rowGroup);
                }
                auto *add = button(tr("Add row"), panel);
                holder->addRow(add);
                connect(add, &QPushButton::clicked, this, [this, path, array] {
                    auto changed = array;
                    auto entry = (array.isEmpty() ? QJsonObject{} : array.last().toObject());
                    entry["id"] = QUuid::createUuid().toString(QUuid::WithoutBraces);
                    changed.append(entry); editEffectNested(path, changed); refreshEffectEditor();
                });
            } else {
                auto *input = new QLineEdit(panel);
                QStringList strings;
                for (const auto &part : array) strings.append(part.toString());
                input->setText(strings.join(" · "));
                holder->addRow(path.last(), input);
                connect(input, &QLineEdit::editingFinished, this, [this, path, input] {
                    QJsonArray values;
                    for (const auto &part : input->text().split(" · ", Qt::SkipEmptyParts)) values.append(part);
                    editEffectNested(path, values);
                });
            }
            return;
        }
        const QString key = path.last();
        if (!m_effectSearch->text().isEmpty() && !key.contains(m_effectSearch->text(), Qt::CaseInsensitive)) return;
        QString scorePath;
        if (path.first() == "wizprocess") scorePath = path.join('.');
        if (path.size() == 4 && path.first() == "ultimateSort" && path[1] == "recipes") {
            const int row = path[2].toInt();
            const auto effects = m_recipe["effects"].toArray();
            const int current = m_processes->currentRow();
            if (current >= 0 && current < effects.size()) {
                const auto rows = effects[current].toObject()["ultimateSort"].toObject()["recipes"].toArray();
                if (row >= 0 && row < rows.size()) scorePath = QStringLiteral("ultimateSort.%1.%2").arg(rows[row].toObject()["id"].toString(), key);
            }
        }
        if (value.isBool()) {
            auto *checkbox = new QCheckBox(panel); checkbox->setChecked(value.toBool());
            holder->addRow(key, checkbox);
            connect(checkbox, &QCheckBox::toggled, this, [this, path](bool checked) { editEffectNested(path, checked); });
        } else if (value.isDouble()) {
            auto *number = new QDoubleSpinBox(panel);
            number->setRange(-1000000000, 1000000000);
            number->setDecimals(3); number->setSingleStep(.01); number->setValue(value.toDouble());
            holder->addRow(key, number);
            connect(number, QOverload<double>::of(&QDoubleSpinBox::valueChanged), this, [this, path, scorePath](double changed) {
                if (!scorePath.isEmpty()) m_effectEditor->setProperty("lastParameter", scorePath);
                editEffectNested(path, changed);
            });
        } else if (value.isString()) {
            const auto options = optionsFor(key);
            if (!options.isEmpty()) {
                auto *choice = new QComboBox(panel); choice->addItems(options);
                choice->setCurrentIndex(qMax(0, choice->findText(value.toString())));
                holder->addRow(key, choice);
                connect(choice, &QComboBox::currentTextChanged, this, [this, path](const QString &changed) {
                    editEffectNested(path, changed);
                });
            } else {
                auto *input = new QLineEdit(value.toString(), panel); holder->addRow(key, input);
                connect(input, &QLineEdit::editingFinished, this, [this, path, input] { editEffectNested(path, input->text()); });
            }
        }
    };
    for (const auto &key : {"wizprocess", "ultimateSort", "characterField", "languageBody", "zhuyinField", "tileField"}) {
        if (!effect.contains(key)) continue;
        auto *group = new QGroupBox(QString::fromUtf8(key), panel);
        auto *inner = new QFormLayout(group);
        buildNested(inner, effect[key], {QString::fromUtf8(key)});
        layout->insertWidget(layout->count() - 1, group);
    }
    setEditor(m_effectEditor, panel);
}

void TempleDock::refreshFormEditor() {
    auto *panel = new QWidget(m_formEditor);
    auto *layout = new QFormLayout(panel);
    const int index = m_forms->currentRow();
    const auto forms = m_recipe["formStack"].toArray();
    if (index < 0 || index >= forms.size()) { layout->addRow(new QLabel(tr("Add or select a form."), panel)); setEditor(m_formEditor, panel); return; }
    const auto form = forms[index].toObject()["form"].toObject();
    const auto parameters = form["parameters"].toObject();
    const QString filter = m_formSearch->text().trimmed();
    auto *seed = new QSpinBox(panel); seed->setRange(0, 2000000000); seed->setValue(form["seed"].toInt());
    layout->addRow(tr("Seed"), seed);
    connect(seed, QOverload<int>::of(&QSpinBox::valueChanged), this, [this](int value) {
        editForm([value](QJsonObject &item) { item["seed"] = value; });
    });
    for (const auto &value : TempleRecipe::catalog()["formParameters"].toArray()) {
        const auto parameter = value.toObject();
        const QString key = parameter["id"].toString(), label = parameter["label"].toString(key);
        if (!filter.isEmpty() && !key.contains(filter, Qt::CaseInsensitive) && !label.contains(filter, Qt::CaseInsensitive)) continue;
        auto *number = new QDoubleSpinBox(panel);
        number->setRange(parameter["min"].toDouble(), parameter["max"].toDouble());
        number->setDecimals(parameter["step"].toDouble() >= 1 ? 0 : 3);
        number->setSingleStep(parameter["step"].toDouble(.01));
        number->setValue(parameters[key].toDouble(parameter["default"].toDouble()));
        number->setToolTip(parameter["description"].toString());
        layout->addRow(label, number);
        connect(number, QOverload<double>::of(&QDoubleSpinBox::valueChanged), this, [this, key](double value) {
            editForm([key, value](QJsonObject &item) { auto fields = item["parameters"].toObject(); fields[key] = value; item["parameters"] = fields; });
        });
    }
    setEditor(m_formEditor, panel);
}

void TempleDock::refreshPalette() {
    const auto colors = m_recipe["palette"].toArray();
    const auto params = m_recipe["koneForm"].toObject()["parameters"].toObject();
    for (int index = 0; index < qMin(4, colors.size()); ++index) {
        auto *swatch = findChild<QPushButton *>(QStringLiteral("templeSwatch%1").arg(index));
        if (!swatch) continue;
        const QString hex = colorName(colors[index].toInt());
        swatch->setText(hex);
        swatch->setStyleSheet(QStringLiteral("background-color: %1; color: %2;").arg(hex, QColor::fromRgb(colors[index].toInt()).lightness() < 130 ? "white" : "black"));
        auto *lock = findChild<QCheckBox *>(QStringLiteral("templeLock%1").arg(index));
        if (lock) { const QSignalBlocker blocker(lock); lock->setChecked(params[QStringLiteral("printLock%1").arg(index)].toInt() >= 1); }
    }
}
void TempleDock::refreshScore() {
    if (!m_scoreOwner || !m_scores) return;
    const QString selectedOwner = m_scoreOwner->currentData().toString();
    {
        const QSignalBlocker blocker(m_scoreOwner);
        m_scoreOwner->clear();
        if (m_recipe["baseMode"] == "kone") m_scoreOwner->addItem(tr("FORM"), "form");
        int position = 1;
        for (const auto &value : m_recipe["effects"].toArray()) {
            const auto effect = value.toObject();
            const QString effectId = QStringLiteral("effect:") + effect["id"].toString();
            m_scoreOwner->addItem(QStringLiteral("%1. %2").arg(position++).arg(TempleRecipe::labelFor(effect["type"].toString())), effectId);
        }
        for (const auto &value : m_recipe["layers"].toArray()) {
            const auto layer = value.toObject();
            const QString layerId = QStringLiteral("layer:") + layer["id"].toString();
            m_scoreOwner->addItem(layer["label"].toString(), layerId);
        }
        m_scoreOwner->setCurrentIndex(qMax(0, m_scoreOwner->findData(selectedOwner)));
    }
    refreshScoreControls();
    const int selected = m_scores->currentRow();
    const QSignalBlocker blocker(m_scores);
    m_scores->clear();
    for (const auto &value : m_recipe["timeScore"].toArray()) {
        const auto track = value.toObject();
        const QString owner = track["target"] == "form" ? tr("FORM") : track["owner"].toString().left(8);
        m_scores->addItem(QStringLiteral("%1%2 · %3 · %4 points").arg(track["enabled"].toBool(true) ? QString() : QStringLiteral("◌ "))
            .arg(owner, track["parameter"].toString()).arg(track["points"].toArray().size()));
    }
    if (m_scores->count()) m_scores->setCurrentRow(qBound(0, selected, m_scores->count() - 1));
    refreshScorePoints();
}
void TempleDock::refreshScoreControls() {
    if (!m_scoreControl || !m_scoreOwner) return;
    const QString selected = m_scoreControl->currentData().toString();
    const QString owner = m_scoreOwner->currentData().toString();
    const QSignalBlocker blocker(m_scoreControl);
    m_scoreControl->clear();
    if (owner == "form") {
        for (const auto &value : TempleRecipe::catalog()["formParameters"].toArray()) {
            const auto item = value.toObject();
            if (!item["choices"].isArray()) m_scoreControl->addItem(item["label"].toString(), item["id"].toString());
        }
    } else if (owner.startsWith("effect:")) {
        const QString id = owner.mid(7);
        QString type;
        for (const auto &value : m_recipe["effects"].toArray())
            if (value.toObject()["id"] == id) { type = value.toObject()["type"].toString(); break; }
        for (const auto &value : TempleRecipe::catalog()["effects"].toArray()) {
            const auto effect = value.toObject(); if (effect["type"] != type) continue;
            for (const auto &parameter : effect["parameters"].toArray()) {
                const auto item = parameter.toObject();
                if (!item["choices"].isArray() && !((type == "palette-cycle" || type == "surface-motion")
                    && item["id"] == "speed")) m_scoreControl->addItem(item["label"].toString(), item["id"].toString());
            }
            break;
        }
    } else if (owner.startsWith("layer:")) m_scoreControl->addItem(tr("Presence"), "opacity");
    m_scoreControl->setCurrentIndex(qMax(0, m_scoreControl->findData(selected)));
}
void TempleDock::refreshScorePoints() {
    if (!m_scorePoints || !m_scores) return;
    const auto tracks = m_recipe["timeScore"].toArray();
    const int index = m_scores->currentRow();
    const auto track = index >= 0 && index < tracks.size() ? tracks[index].toObject() : QJsonObject{};
    const auto points = track["points"].toArray();
    const int selected = m_scorePoints->currentRow();
    {
        const QSignalBlocker blocker(m_scorePoints);
        m_scorePoints->clear();
        for (const auto &entry : points) {
            const auto point = entry.toObject();
            m_scorePoints->addItem(QStringLiteral("%1% · %2 · %3")
                .arg(point["time"].toDouble() * 100, 0, 'f', 1)
                .arg(point["value"].toDouble(), 0, 'f', 3)
                .arg(point["ease"].toString("smooth")));
        }
        if (m_scorePoints->count()) m_scorePoints->setCurrentRow(qBound(0, selected, m_scorePoints->count() - 1));
    }
    { const QSignalBlocker blocker(m_scoreEnabled); m_scoreEnabled->setChecked(track["enabled"].toBool(true)); }
    const int pointIndex = m_scorePoints->currentRow();
    if (pointIndex < 0 || pointIndex >= points.size()) return;
    const auto point = points[pointIndex].toObject();
    QJsonObject parameter;
    if (track["target"] == "form") {
        for (const auto &value : TempleRecipe::catalog()["formParameters"].toArray())
            if (value.toObject()["id"] == track["parameter"]) { parameter = value.toObject(); break; }
    } else if (track["target"] == "effect") {
        QString type;
        for (const auto &value : m_recipe["effects"].toArray())
            if (value.toObject()["id"] == track["owner"]) { type = value.toObject()["type"].toString(); break; }
        for (const auto &effect : TempleRecipe::catalog()["effects"].toArray()) {
            if (effect.toObject()["type"] != type) continue;
            for (const auto &value : effect.toObject()["parameters"].toArray())
                if (value.toObject()["id"] == track["parameter"]) { parameter = value.toObject(); break; }
        }
    }
    { const QSignalBlocker blocker(m_scoreTime); m_scoreTime->setValue(point["time"].toDouble() * 100); }
    { const QSignalBlocker blocker(m_scoreValue);
      m_scoreValue->setRange(parameter["min"].toDouble(track["target"] == "layer" ? 0 : -100000),
          parameter["max"].toDouble(track["target"] == "layer" ? 1 : 100000));
      m_scoreValue->setSingleStep(parameter["step"].toDouble(.01));
      m_scoreValue->setValue(point["value"].toDouble()); }
    { const QSignalBlocker blocker(m_scoreEase); m_scoreEase->setCurrentIndex(qMax(0, m_scoreEase->findData(point["ease"].toString("smooth")))); }
}
