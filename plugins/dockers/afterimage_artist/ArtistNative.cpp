// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#include "ArtistNative.h"
#include "ComicProject.h"
#include <QBuffer>
#include <QDir>
#include <QFutureWatcher>
#include <QFileInfo>
#include <QFont>
#include <QFontMetricsF>
#include <QHash>
#include <QPainter>
#include <QPdfWriter>
#include <QPageLayout>
#include <QPageSize>
#include <QProcess>
#include <QProcessEnvironment>
#include <QCoreApplication>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QSaveFile>
#include <QRegularExpression>
#include <QScopedPointer>
#include <QTimer>
#include <QtMath>
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

namespace {
void refreshVectorTree(KisNodeSP node)
{
    if (auto *layer = dynamic_cast<KisShapeLayer *>(node.data())) layer->forceUpdateHiddenAreaOnOriginal();
    for (auto child = node->firstChild(); child; child = child->nextSibling()) refreshVectorTree(child);
}
}

QString ArtistNative::writeComicPdf(const QStringList &pages, const QString &path, Progress progress)
{
    if (pages.isEmpty()) return QObject::tr("Save at least one KRA page in the comic folder.");
    QSaveFile file(path);
    if (!file.open(QIODevice::WriteOnly)) return QObject::tr("The comic PDF could not be opened.");
    std::unique_ptr<QPdfWriter> writer(new QPdfWriter(&file));
    writer->setResolution(72);
    writer->setCreator(QStringLiteral("Afterimage"));
    QPainter painter;
    for (int index = 0; index < pages.size(); ++index) {
        QScopedPointer<KisDocument> document(KisPart::instance()->createDocument());
        document->setFileBatchMode(true);
        if (!document->loadNativeFormat(pages[index]))
            return QObject::tr("Could not open saved page %1.").arg(QFileInfo(pages[index]).fileName());
        KisImageSP image = document->image();
        if (!image) return QObject::tr("A saved page has no artwork.");
        refreshVectorTree(image->rootLayer());
        image->initialRefreshGraph();
        image->waitForDone();
        const QRect bounds = image->bounds();
        const qreal xRes = image->xRes() > 0 ? image->xRes() : 1.0;
        const qreal yRes = image->yRes() > 0 ? image->yRes() : 1.0;
        if (bounds.isEmpty()) return QObject::tr("A saved page has no printable area.");
        QPageLayout layout(QPageSize(QSizeF(bounds.width() / xRes, bounds.height() / yRes), QPageSize::Point),
            QPageLayout::Portrait, QMarginsF(), QPageLayout::Point);
        layout.setMode(QPageLayout::FullPageMode);
        if (!layout.isValid() || !writer->setPageLayout(layout))
            return QObject::tr("A PDF page size could not be set.");
        if (index == 0) {
            if (!painter.begin(writer.get())) return QObject::tr("The comic PDF could not be written.");
        } else if (!writer->newPage()) return QObject::tr("The next PDF page could not be started.");
        image->barrierLock(true);
        KisPaintDeviceSP pixels = new KisPaintDevice(*image->projection());
        image->unlock();
        const int rows = int(qMax<qint64>(1, qMin<qint64>(256,
            (8 * 1024 * 1024) / qMax<qint64>(1, qint64(bounds.width()) * 4))));
        for (int y = bounds.top(); y <= bounds.bottom(); y += rows) {
            const QRect source(bounds.left(), y, bounds.width(), qMin(rows, bounds.bottom() - y + 1));
            const QImage strip = pixels->convertToQImage(nullptr, source);
            if (strip.isNull()) return QObject::tr("A comic page could not be rendered.");
            painter.drawImage(QRectF(0, (y - bounds.top()) / yRes,
                bounds.width() / xRes, source.height() / yRes), strip);
        }
        pixels.clear();
        if (progress) progress(index + 1, pages.size());
    }
    if (painter.isActive()) painter.end();
    writer.reset();
    return file.commit() ? QString() : QObject::tr("The comic PDF could not be saved.");
}

void ArtistNative::exportComicPdf(const QStringList &kraPaths, const QString &path, Done done, Progress progress)
{
    if (m_bookProcess) { done(false, tr("A comic PDF is already being exported.")); return; }
    if (kraPaths.isEmpty()) { done(false, tr("Save at least one KRA page in the comic folder.")); return; }
    auto *process = new QProcess(this);
    m_bookProcess = process;
    process->setProgram(QDir(QCoreApplication::applicationDirPath()).filePath(
#ifdef Q_OS_WIN
        QStringLiteral("afterimage_comic_pdf_worker.exe")
#else
        QStringLiteral("afterimage_comic_pdf_worker")
#endif
    ));
    QProcessEnvironment environment = QProcessEnvironment::systemEnvironment();
    environment.insert(QStringLiteral("QT_QPA_PLATFORM"), QStringLiteral("offscreen"));
    process->setProcessEnvironment(environment);
    process->setArguments({});
    const QJsonArray pageArray = QJsonArray::fromStringList(kraPaths);
    const QByteArray request = QJsonDocument(QJsonObject{{"path", path}, {"pages", pageArray}}).toJson(QJsonDocument::Compact);
    connect(process, &QProcess::started, this, [process, request] {
        process->write(request);
        process->closeWriteChannel();
    });
    auto output = std::make_shared<QByteArray>();
    connect(process, &QProcess::readyReadStandardOutput, this, [process, output, progress] {
        output->append(process->readAllStandardOutput());
        while (true) {
            const int end = output->indexOf('\n');
            if (end < 0) break;
            const QByteArray line = output->left(end).trimmed();
            output->remove(0, end + 1);
            const QList<QByteArray> fields = line.split(' ');
            if (fields.size() == 3 && fields[0] == "PAGE" && progress)
                progress(fields[1].toInt(), fields[2].toInt());
        }
        if (output->size() > 4096) output->clear();
    });
    auto completed = std::make_shared<bool>(false);
    auto finish = [this, process, path, done, completed](bool okay, const QString &reason) {
        if (*completed) return;
        *completed = true;
        if (m_bookProcess == process) m_bookProcess = nullptr;
        const bool canceled = process->property("afterimageCanceled").toBool();
        process->deleteLater();
        done(okay && !canceled, canceled ? tr("Comic PDF export stopped.") :
            okay ? tr("Exported saved pages to %1").arg(path) : reason);
    };
    connect(process, QOverload<int, QProcess::ExitStatus>::of(&QProcess::finished), this,
        [process, path, finish](int code, QProcess::ExitStatus status) {
            const bool okay = status == QProcess::NormalExit && code == 0 && QFileInfo(path).isFile();
            QString error = QString::fromUtf8(process->readAllStandardError()).trimmed().left(500);
            if (error.isEmpty()) error = QObject::tr("The comic PDF export process did not finish.");
            finish(okay, error);
        });
    connect(process, &QProcess::errorOccurred, this, [finish](QProcess::ProcessError error) {
        if (error == QProcess::FailedToStart) finish(false, QObject::tr("The comic PDF exporter could not start."));
    });
    process->start();
}

void ArtistNative::cancelComicPdf()
{
    if (!m_bookProcess) return;
    m_bookProcess->setProperty("afterimageCanceled", true);
    m_bookProcess->kill();
}

void ArtistNative::saveComicPage(KisDocument *document, const QString &path, const QString &comicFolder, Done done)
{
    const QFileInfo destination(path);
    const QString absolutePath = destination.absoluteFilePath();
    if (!document || !document->image() || document->isSaving() ||
        !path.endsWith(QLatin1String(".kra"), Qt::CaseInsensitive) || !destination.dir().exists()) {
        done(false, tr("Choose an existing folder and a KRA page filename. Wait for any current save to finish."));
        return;
    }
    const QPointer<KisDocument> owner(document);
    const bool priorBatchMode = document->fileBatchMode();
    const auto completed = std::make_shared<bool>(false);
    const auto connection = std::make_shared<QMetaObject::Connection>();
    const QString folder = comicFolder.isEmpty() ? destination.absolutePath() : comicFolder;
    auto complete = [owner, absolutePath, folder, completed, connection, priorBatchMode, done](bool success, const QString &message) {
        if (*completed) return;
        *completed = true;
        QObject::disconnect(*connection);
        if (owner) owner->setFileBatchMode(priorBatchMode);
        if (!success || !owner) {
            done(false, message.isEmpty() ? QObject::tr("The editable page could not be saved.") : message);
            return;
        }
        const QFileInfo saved(absolutePath);
        if (!saved.isFile() || saved.size() == 0) {
            done(false, QObject::tr("The native save finished without a KRA page on disk."));
            return;
        }
        if (QDir(folder).canonicalPath() != saved.dir().canonicalPath()) {
            done(true, QObject::tr("Editable page saved outside this comic folder."));
            return;
        }
        QString error;
        if (!ComicProject::appendPage(folder, saved.fileName(), &error)) {
            done(false, QObject::tr("The page was saved, but its comic order could not be updated: %1").arg(error));
            return;
        }
        done(true, QObject::tr("Editable page saved and added to this comic."));
    };
    *connection = connect(document, &KisDocument::sigCompleteBackgroundSaving, this,
        [absolutePath, complete](const KritaUtils::ExportFileJob &job, KisImportExportErrorCode status,
                                 const QString &error, const QString &) {
            if (QFileInfo(job.filePath).absoluteFilePath() == absolutePath) complete(status.isOk(), error);
        });
    connect(document, &QObject::destroyed, this, [complete] {
        complete(false, QObject::tr("The page was closed before its save finished."));
    });
    document->setFileBatchMode(true);
    if (!document->saveAs(absolutePath, "application/x-krita", false))
        complete(false, tr("The native background save could not start."));
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

QByteArray ArtistNative::letteringSvg(int width, int height, const QString &content, const QString &family,
    int size, int x, int y, bool balloon)
{
    const int estimatedWidth = qMin(width - x, qMax(220, qMin(width / 2, int(qMin<qint64>(qint64(size) * 12, width)))));
    const int estimatedHeight = qMin(height - y, qMax(int(qMin<qint64>(qint64(size) * 3, height)), height / 5));
    return letteringSvg(width, height, content, family, size,
        QRect(x, y, estimatedWidth, estimatedHeight), balloon);
}

QByteArray ArtistNative::letteringSvg(int width, int height, const QString &content, const QString &family,
    int requestedSize, const QRect &requestedRegion, bool balloon)
{
    const QString text = content.trimmed();
    const QRect region = requestedRegion.intersected(QRect(0, 0, width, height));
    if (text.isEmpty() || requestedSize <= 0 || region.width() < 16 || region.height() < 16) return {};
    QStringList lines;
    int chosenSize = 0, lineHeight = 0, padding = 0;
    QFontMetricsF finalMetrics{QFont()};
    for (int size = qMin(requestedSize, region.height()); size >= 8; --size) {
        const int inset = balloon ? qMax(6, qRound(size * 0.5)) : qMax(2, qRound(size * 0.12));
        const int usableWidth = region.width() - inset * 2;
        const int usableHeight = region.height() - inset * 2;
        if (usableWidth <= 0 || usableHeight <= 0) continue;
        QFont font(family); font.setPixelSize(size);
        const QFontMetricsF metrics(font);
        QStringList wrapped;
        for (const QString &paragraph : text.split('\n')) {
            const QStringList words = paragraph.split(QRegularExpression("\\s+"), Qt::SkipEmptyParts);
            if (words.isEmpty()) { wrapped.append(QString()); continue; }
            QString line;
            for (const QString &word : words) {
                const QString candidate = line.isEmpty() ? word : line + ' ' + word;
                if (metrics.horizontalAdvance(candidate) <= usableWidth) { line = candidate; continue; }
                if (!line.isEmpty()) { wrapped.append(line); line.clear(); }
                for (const QChar letter : word) {
                    if (!line.isEmpty() && metrics.horizontalAdvance(line + letter) > usableWidth) {
                        wrapped.append(line); line.clear();
                    }
                    line += letter;
                }
            }
            wrapped.append(line);
        }
        const int leading = qCeil(metrics.lineSpacing());
        if (wrapped.size() * leading > usableHeight) continue;
        lines = wrapped; chosenSize = size; lineHeight = leading; padding = inset; finalMetrics = metrics;
        break;
    }
    if (!chosenSize || lines.isEmpty()) return {};
    QString svg = QString("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"%1\" height=\"%2\" viewBox=\"0 0 %1 %2\">").arg(width).arg(height);
    if (balloon) {
        svg += QString("<rect x=\"%1\" y=\"%2\" width=\"%3\" height=\"%4\" rx=\"%5\" fill=\"white\" stroke=\"#202020\" stroke-width=\"%6\"/>")
            .arg(region.x()).arg(region.y()).arg(region.width()).arg(region.height()).arg(qMax(8, chosenSize / 2)).arg(qMax(2, chosenSize / 14));
    }
    svg += QString("<text font-family=\"%1\" font-size=\"%2\" fill=\"#202020\">").arg(family.toHtmlEscaped()).arg(chosenSize);
    const int baseline = region.y() + padding + qCeil(finalMetrics.ascent());
    for (int i = 0; i < lines.size(); ++i)
        svg += QString("<tspan x=\"%1\" y=\"%2\">%3</tspan>")
            .arg(region.x() + padding).arg(baseline + i * lineHeight).arg(safeSvg(lines[i]));
    return (svg + "</text></svg>").toUtf8();
}
