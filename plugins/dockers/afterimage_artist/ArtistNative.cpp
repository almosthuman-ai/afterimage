// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#include "ArtistNative.h"
#include <QBuffer>
#include <QFutureWatcher>
#include <QHash>
#include <QPainter>
#include <QPdfWriter>
#include <QPageLayout>
#include <QPageSize>
#include <QSaveFile>
#include <QTimer>
#include <QtConcurrentRun>
#include <KisDocument.h>
#include <KisMainWindow.h>
#include <KisPart.h>
#include <KoColor.h>
#include <KoColorSpaceRegistry.h>
#include <KoShape.h>
#include <KoShapeControllerBase.h>
#include <commands/KoShapeCreateCommand.h>
#include <commands/kis_image_layer_add_command.h>
#include <commands/kis_image_layer_remove_command.h>
#include <flake/kis_shape_layer.h>
#include <kis_image.h>
#include <kis_group_layer.h>
#include <kis_paint_device.h>
#include <kis_paint_layer.h>
#include <kis_processing_applicator.h>
#include <kis_layer_properties_icons.h>
#include <commands/kis_node_property_list_command.h>
#include <memory>
#include <future>
#include <chrono>
#include <limits>
#include <png.h>

namespace {
QColor closestPaletteColor(const QColor &source, const QVector<QColor> &palette, int bias)
{
    int best = std::numeric_limits<int>::max();
    QColor chosen = palette.first();
    const int r = qBound(0, source.red() + bias, 255), g = qBound(0, source.green() + bias, 255), b = qBound(0, source.blue() + bias, 255);
    for (const QColor &candidate : palette) {
        const int dr = r - candidate.red(), dg = g - candidate.green(), db = b - candidate.blue();
        const int distance = dr * dr * 3 + dg * dg * 4 + db * db * 2;
        if (distance < best) { best = distance; chosen = candidate; }
    }
    chosen.setAlpha(source.alpha());
    return chosen;
}
QString safeSvg(const QString &text) { return text.toHtmlEscaped().replace('\n', ' '); }

QString writePngRows(const QString &path, KisPaintDeviceSP pixels, const QRect &bounds, int scale, bool indexed)
{
    const qint64 width = qint64(bounds.width()) * scale;
    const qint64 height = qint64(bounds.height()) * scale;
    if (width <= 0 || height <= 0 || width > std::numeric_limits<int>::max() || height > std::numeric_limits<int>::max())
        return QObject::tr("The scaled PNG dimensions are too large for PNG.");
    const qint64 rowBytes = width * (indexed ? 1 : 4);
    if (rowBytes > std::numeric_limits<int>::max()) return QObject::tr("A PNG row is too wide to render.");
    QHash<QRgb, int> indices;
    QVector<QRgb> colors;
    if (indexed) {
        for (int y = bounds.top(); y <= bounds.bottom(); ++y) {
            const QImage row = pixels->convertToQImage(nullptr, QRect(bounds.left(), y, bounds.width(), 1)).convertToFormat(QImage::Format_ARGB32);
            if (row.isNull()) return QObject::tr("The indexed image could not be rendered.");
            for (int x = 0; x < row.width(); ++x) {
                const QRgb rgba = row.pixel(x, 0);
                if (indices.contains(rgba)) continue;
                if (colors.size() == 256) return QObject::tr("This image has more than 256 colors. Choose RGBA PNG to keep every color and alpha value.");
                indices.insert(rgba, colors.size());
                colors.append(rgba);
            }
        }
    }
    QSaveFile file(path);
    if (!file.open(QIODevice::WriteOnly)) return QObject::tr("The PNG could not be opened for writing.");
    png_structp png = png_create_write_struct(PNG_LIBPNG_VER_STRING, nullptr, nullptr, nullptr);
    if (!png) return QObject::tr("The PNG writer could not start.");
    png_infop info = png_create_info_struct(png);
    if (!info) { png_destroy_write_struct(&png, nullptr); return QObject::tr("The PNG writer could not start."); }
    if (setjmp(png_jmpbuf(png))) {
        png_destroy_write_struct(&png, &info);
        return QObject::tr("The PNG could not be written.");
    }
    png_set_write_fn(png, &file, [](png_structp writer, png_bytep bytes, png_size_t length) {
        auto *target = static_cast<QIODevice *>(png_get_io_ptr(writer));
        if (target->write(reinterpret_cast<const char *>(bytes), qint64(length)) != qint64(length))
            png_error(writer, "PNG output write failed");
    }, nullptr);
    png_set_IHDR(png, info, png_uint_32(width), png_uint_32(height), 8,
        indexed ? PNG_COLOR_TYPE_PALETTE : PNG_COLOR_TYPE_RGBA, PNG_INTERLACE_NONE,
        PNG_COMPRESSION_TYPE_DEFAULT, PNG_FILTER_TYPE_DEFAULT);
    png_color table[256] = {};
    png_byte alpha[256] = {};
    if (indexed) {
        for (int i = 0; i < colors.size(); ++i) {
            table[i].red = qRed(colors[i]); table[i].green = qGreen(colors[i]); table[i].blue = qBlue(colors[i]);
            alpha[i] = qAlpha(colors[i]);
        }
        png_set_PLTE(png, info, table, colors.size());
        png_set_tRNS(png, info, alpha, colors.size(), nullptr);
    }
    png_write_info(png, info);
    QByteArray output(int(rowBytes), '\0');
    for (int y = bounds.top(); y <= bounds.bottom(); ++y) {
        const QImage row = pixels->convertToQImage(nullptr, QRect(bounds.left(), y, bounds.width(), 1)).convertToFormat(QImage::Format_ARGB32);
        if (row.isNull()) { png_destroy_write_struct(&png, &info); return QObject::tr("The PNG could not be rendered."); }
        uchar *destination = reinterpret_cast<uchar *>(output.data());
        for (int x = 0; x < row.width(); ++x) {
            const QRgb rgba = row.pixel(x, 0);
            for (int copy = 0; copy < scale; ++copy) {
                const int offset = (x * scale + copy) * (indexed ? 1 : 4);
                if (indexed) destination[offset] = uchar(indices.value(rgba));
                else {
                    destination[offset] = qRed(rgba);
                    destination[offset + 1] = qGreen(rgba);
                    destination[offset + 2] = qBlue(rgba);
                    destination[offset + 3] = qAlpha(rgba);
                }
            }
        }
        for (int copy = 0; copy < scale; ++copy) png_write_row(png, destination);
    }
    png_write_end(png, info);
    png_destroy_write_struct(&png, &info);
    return file.commit() ? QString() : QObject::tr("The PNG could not be saved.");
}
}

KisDocument *ArtistNative::create(KisMainWindow *window, const QString &name, int width, int height, bool paper)
{
    if (!window || width <= 0 || height <= 0) return nullptr;
    std::unique_ptr<KisDocument> document(KisPart::instance()->createDocument());
    const auto *space = KoColorSpaceRegistry::instance()->rgb8();
    KisImageSP image = new KisImage(document->createUndoStore(), width, height, space, name);
    const qreal resolution = paper ? 300.0 / 72.0 : 1.0;
    image->setResolution(resolution, resolution);
    document->setCurrentImage(image);
    if (paper) {
        KisPaintDeviceSP pixels = new KisPaintDevice(space);
        pixels->fill(QRect(0, 0, width, height), KoColor(Qt::white, space));
        image->addNode(new KisPaintLayer(image, QObject::tr("Paper"), 255, pixels), image->rootLayer());
    }
    KisPaintLayerSP drawing = new KisPaintLayer(image, paper ? QObject::tr("Artwork") : QObject::tr("Pixels"), 255);
    image->addNode(drawing, image->rootLayer());
    document->setCurrentImage(image, true, drawing);
    document->setObjectName(name);
    document->setModified(true);
    KisPart::instance()->addDocument(document.get());
    window->addViewAndNotifyLoadingCompleted(document.get());
    return document.release();
}

void ArtistNative::addVector(KisDocument *document, const QByteArray &svg, const QString &name,
    const QString &replacePrefix, Done done)
{
    if (!document || !document->image()) { done(false, tr("Open a page first.")); return; }
    const QPointer<KisDocument> owner(document);
    KisImageSP image = document->image();
    QByteArray source(svg);
    QBuffer input(&source);
    input.open(QIODevice::ReadOnly);
    QStringList warnings, errors;
    const QList<KoShape *> shapes = KisShapeLayer::createShapesFromSvg(&input, {}, image->bounds(), image->xRes() * 72.0,
        document->shapeController()->resourceManager(), false, nullptr, &warnings, &errors);
    if (shapes.isEmpty() || !errors.isEmpty()) {
        qDeleteAll(shapes);
        done(false, tr("The editable shapes could not be made: %1").arg(errors.join("; ").left(300))); return;
    }
    KisNodeSP old;
    if (!replacePrefix.isEmpty()) {
        for (auto node = image->rootLayer()->firstChild(); node; node = node->nextSibling())
            if (node->name().startsWith(replacePrefix)) { old = node; break; }
    }
    KisShapeLayerSP layer = new KisShapeLayer(document->shapeController(), image, name, 255);
    KisNodeSP above = old ? old->prevSibling() : image->rootLayer()->lastChild();
    KisProcessingApplicator operation(image, KisNodeSP(), KisProcessingApplicator::NONE, {}, kundo2_i18n("Edit comic artwork"));
    if (old) operation.applyCommand(new KisImageLayerRemoveCommand(image, old), KisStrokeJobData::BARRIER, KisStrokeJobData::EXCLUSIVE);
    operation.applyCommand(new KisImageLayerAddCommand(image, layer, image->rootLayer(), above,
        KisImageLayerAddCommand::DoRedoUpdates | KisImageLayerAddCommand::DoUndoUpdates | KisImageLayerAddCommand::DontActivateOnAddition),
        KisStrokeJobData::BARRIER, KisStrokeJobData::EXCLUSIVE);
    operation.applyCommand(new KoShapeCreateCommand(document->shapeController(), shapes, layer.data()),
        KisStrokeJobData::BARRIER, KisStrokeJobData::EXCLUSIVE);
    auto completion = std::make_shared<std::future<bool>>(operation.successfullyCompletedFuture());
    operation.end();
    auto *timer = new QTimer(this);
    timer->setInterval(30);
    connect(timer, &QTimer::timeout, this, [timer, completion, owner, image, layer, done] () mutable {
        if (completion->wait_for(std::chrono::seconds(0)) != std::future_status::ready) return;
        const bool success = completion->get(); timer->stop(); timer->deleteLater();
        if (success && owner && owner->image().data() == image.data()) {
            layer->forceUpdateHiddenAreaOnOriginal();
            image->refreshGraphAsync();
            done(true, QObject::tr("Editable vector layer added. Save the page as KRA to keep editing it."));
        } else done(false, QObject::tr("The vector edit did not finish."));
    });
    timer->start();
}

void ArtistNative::exportProjection(KisDocument *document, const QString &path, int scale, bool pdf, bool indexed, Done done)
{
    if (!document || !document->image()) { done(false, tr("Open artwork first.")); return; }
    const QPointer<KisDocument> owner(document);
    KisImageSP image = document->image();
    auto *wait = new QTimer(this);
    wait->setInterval(30);
    connect(wait, &QTimer::timeout, this, [this, wait, owner, image, path, scale, pdf, indexed, done] () mutable {
        if (!owner || owner->image().data() != image.data()) { wait->stop(); wait->deleteLater(); done(false, tr("The artwork was closed.")); return; }
        if (!image->tryBarrierLock(true)) return;
        wait->stop(); wait->deleteLater();
        const QRect bounds = image->bounds();
        KisPaintDeviceSP pixels = new KisPaintDevice(*image->projection());
        image->unlock();
        auto *watcher = new QFutureWatcher<QString>(this);
        connect(watcher, &QFutureWatcher<QString>::finished, this, [watcher, done, path] {
            const QString error = watcher->result(); watcher->deleteLater();
            done(error.isEmpty(), error.isEmpty() ? QObject::tr("Exported %1").arg(path) : error);
        });
        watcher->setFuture(QtConcurrent::run([pixels, bounds, path, scale, pdf, indexed] {
            if (!pdf) return writePngRows(path, pixels, bounds, scale, indexed);
            if (pdf) {
                QPdfWriter writer(path);
                writer.setResolution(300);
                const QPageSize pageSize(QSizeF(bounds.width() * 72.0 / 300.0,
                    bounds.height() * 72.0 / 300.0), QPageSize::Point);
                QPageLayout pageLayout(pageSize, QPageLayout::Portrait, QMarginsF(), QPageLayout::Point);
                pageLayout.setMode(QPageLayout::FullPageMode);
                if (!writer.setPageLayout(pageLayout)) return QObject::tr("The PDF page size could not be set.");
                QPainter painter(&writer);
                if (!painter.isActive()) return QObject::tr("The PDF could not be written.");
                const int rows = int(qMax<qint64>(1, qMin<qint64>(256,
                    (8 * 1024 * 1024) / qMax<qint64>(1, qint64(bounds.width()) * 4))));
                for (int y = bounds.top(); y <= bounds.bottom(); y += rows) {
                    const QRect source(bounds.left(), y, bounds.width(), qMin(rows, bounds.bottom() - y + 1));
                    const QImage strip = pixels->convertToQImage(nullptr, source);
                    if (strip.isNull()) return QObject::tr("The PDF page could not be rendered.");
                    painter.drawImage(QRect(0, y - bounds.top(), source.width(), source.height()), strip);
                }
                painter.end();
                return QString();
            }
            return QString();
        }));
    });
    wait->start();
}

void ArtistNative::paletteLayer(KisDocument *document, const QVector<QColor> &palette, bool dither, Done done)
{
    if (!document || !document->image()) { done(false, tr("Open artwork first.")); return; }
    if (palette.isEmpty() || palette.size() > 256) { done(false, tr("Choose between 1 and 256 palette colors.")); return; }
    for (const QColor &color : palette) if (!color.isValid()) { done(false, tr("A palette color is invalid.")); return; }
    QPointer<KisDocument> owner(document);
    KisImageSP image = document->image();
    auto *ready = new QTimer(this); ready->setInterval(30);
    connect(ready, &QTimer::timeout, this, [this, ready, owner, image, palette, dither, done] () mutable {
        if (!owner || owner->image().data() != image.data()) {
            ready->stop(); ready->deleteLater(); done(false, tr("The artwork was closed.")); return;
        }
        if (!image->tryBarrierLock(true)) return;
        ready->stop(); ready->deleteLater();
        KisPaintDeviceSP source = new KisPaintDevice(*image->projection());
        const QRect bounds = image->bounds();
        const KoColorSpace *space = image->colorSpace();
        image->unlock();
        auto *watcher = new QFutureWatcher<KisPaintDeviceSP>(this);
        connect(watcher, &QFutureWatcher<KisPaintDeviceSP>::finished, this, [this, watcher, owner, image, done] () mutable {
            KisPaintDeviceSP pixels = watcher->result(); watcher->deleteLater();
            if (!owner || owner->image().data() != image.data() || !pixels) {
                done(false, tr("Palette conversion stopped.")); return;
            }
            KisPaintLayerSP layer = new KisPaintLayer(image, tr("Palette version"), 255, pixels);
            KisProcessingApplicator operation(image, KisNodeSP(), KisProcessingApplicator::NONE, {}, kundo2_i18n("Create palette version"));
            for (auto node = image->rootLayer()->firstChild(); node; node = node->nextSibling()) {
                if (!node->visible()) continue;
                auto properties = node->sectionModelProperties();
                KisLayerPropertiesIcons::setNodeProperty(&properties, KisLayerPropertiesIcons::visible, false);
                operation.applyCommand(new KisNodePropertyListCommand(node, properties),
                    KisStrokeJobData::BARRIER, KisStrokeJobData::EXCLUSIVE);
            }
            operation.applyCommand(new KisImageLayerAddCommand(image, layer, image->rootLayer(), image->rootLayer()->lastChild(),
                KisImageLayerAddCommand::DoRedoUpdates | KisImageLayerAddCommand::DoUndoUpdates | KisImageLayerAddCommand::DontActivateOnAddition),
                KisStrokeJobData::BARRIER, KisStrokeJobData::EXCLUSIVE);
            auto completion = std::make_shared<std::future<bool>>(operation.successfullyCompletedFuture()); operation.end();
            auto *finished = new QTimer(this); finished->setInterval(30);
            connect(finished, &QTimer::timeout, this, [finished, completion, done] {
                if (completion->wait_for(std::chrono::seconds(0)) != std::future_status::ready) return;
                const bool okay = completion->get(); finished->stop(); finished->deleteLater();
                done(okay, okay ? QObject::tr("Palette layer ready. Original layers are hidden underneath and can be shown again.")
                    : QObject::tr("Palette layer could not be added."));
            }); finished->start();
        });
        watcher->setFuture(QtConcurrent::run([source, bounds, palette, dither, space] {
            KisPaintDeviceSP output = new KisPaintDevice(space);
            const int bayer[4][4] = {{0, 8, 2, 10}, {12, 4, 14, 6}, {3, 11, 1, 9}, {15, 7, 13, 5}};
            for (int y = bounds.top(); y <= bounds.bottom(); y += 256) {
                for (int x = bounds.left(); x <= bounds.right(); x += 256) {
                    const QRect tile(x, y, qMin(256, bounds.right() - x + 1), qMin(256, bounds.bottom() - y + 1));
                    QImage raster = source->convertToQImage(nullptr, tile).convertToFormat(QImage::Format_ARGB32);
                    if (raster.isNull()) return KisPaintDeviceSP();
                    for (int py = 0; py < raster.height(); ++py) for (int px = 0; px < raster.width(); ++px) {
                        QColor color = QColor::fromRgba(raster.pixel(px, py));
                        if (color.alpha() == 0) continue;
                        const int bias = dither ? (bayer[(y + py) & 3][(x + px) & 3] - 8) * 4 : 0;
                        raster.setPixelColor(px, py, closestPaletteColor(color, palette, bias));
                    }
                    output->convertFromQImage(raster, nullptr, x, y);
                }
            }
            return output;
        }));
    }); ready->start();
}

QByteArray ArtistNative::panelSvg(int width, int height, const QString &layout, int margin, int gutter)
{
    int cols = 1, rows = 1;
    if (layout == "1x2") rows = 2;
    else if (layout == "3x1") cols = 3;
    else if (layout == "2x2") { cols = 2; rows = 2; }
    else if (layout == "2x3") { cols = 2; rows = 3; }
    const int usefulW = width - 2 * margin - (cols - 1) * gutter;
    const int usefulH = height - 2 * margin - (rows - 1) * gutter;
    if (usefulW <= 0 || usefulH <= 0) return {};
    QString svg = QString("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"%1\" height=\"%2\" viewBox=\"0 0 %1 %2\">").arg(width).arg(height);
    const auto rectangle = [&svg](int x, int y, int w, int h) {
        svg += QString("<rect x=\"%1\" y=\"%2\" width=\"%3\" height=\"%4\" fill=\"none\" stroke=\"#202020\" stroke-width=\"4\"/>")
            .arg(x).arg(y).arg(w).arg(h);
    };
    if (layout == "splash") {
        const int top = (usefulH - gutter) * 2 / 3;
        const int lower = usefulH - top - gutter;
        if (top <= 0 || lower <= 0 || usefulW <= gutter) return {};
        rectangle(margin, margin, usefulW, top);
        rectangle(margin, margin + top + gutter, (usefulW - gutter) / 2, lower);
        rectangle(margin + (usefulW - gutter) / 2 + gutter, margin + top + gutter, usefulW - (usefulW - gutter) / 2 - gutter, lower);
    } else {
        for (int row = 0; row < rows; ++row) for (int column = 0; column < cols; ++column) {
            const int x0 = margin + (usefulW * column) / cols + gutter * column;
            const int x1 = margin + (usefulW * (column + 1)) / cols + gutter * column;
            const int y0 = margin + (usefulH * row) / rows + gutter * row;
            const int y1 = margin + (usefulH * (row + 1)) / rows + gutter * row;
            rectangle(x0, y0, x1 - x0, y1 - y0);
        }
    }
    return (svg + "</svg>").toUtf8();
}

QByteArray ArtistNative::letteringSvg(int width, int height, const QString &content, const QString &family, int size, int x, int y, bool balloon)
{
    const QString text = content.trimmed();
    if (text.isEmpty()) return {};
    const QString font = family.toHtmlEscaped();
    QString svg = QString("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"%1\" height=\"%2\" viewBox=\"0 0 %1 %2\">").arg(width).arg(height);
    const QStringList lines = text.split('\n');
    const int lineHeight = qRound(size * 1.25);
    if (balloon) {
        const int boxW = qMin(width - x, qMax(220, int(size * text.size() * 0.55) + size));
        const int boxH = qMin(height - y, qMax(size * 2, int(lines.size() * lineHeight + size)));
        if (boxW <= 0 || boxH <= 0) return {};
        svg += QString("<rect x=\"%1\" y=\"%2\" width=\"%3\" height=\"%4\" rx=\"%5\" fill=\"white\" stroke=\"#202020\" stroke-width=\"4\"/>")
            .arg(x).arg(y).arg(boxW).arg(boxH).arg(size / 2);
    }
    svg += QString("<text font-family=\"%1\" font-size=\"%2\" fill=\"#202020\">").arg(font).arg(size);
    for (int i = 0; i < lines.size(); ++i)
        svg += QString("<tspan x=\"%1\" y=\"%2\">%3</tspan>").arg(x + (balloon ? size / 2 : 0)).arg(y + size + i * lineHeight).arg(safeSvg(lines[i]));
    return (svg + "</text></svg>").toUtf8();
}
