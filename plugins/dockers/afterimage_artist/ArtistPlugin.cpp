// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#include "PixelDock.h"
#include "ComicDock.h"
#include <KoDockFactoryBase.h>
#include <KoDockRegistry.h>
#include <kpluginfactory.h>

template <typename Dock> class ArtistFactory final : public KoDockFactoryBase
{
public:
    explicit ArtistFactory(QString name) : m_name(std::move(name)) {}
    QString id() const override { return m_name; }
    DockPosition defaultDockPosition() const override { return DockMinimized; }
    QDockWidget *createDockWidget() override {
        auto *dock = new Dock;
        dock->setObjectName(m_name);
        return dock;
    }
private:
    QString m_name;
};

class ArtistPlugin : public QObject
{
    Q_OBJECT
public:
    ArtistPlugin(QObject *parent, const QVariantList &) : QObject(parent) {
        KoDockRegistry::instance()->add(new ArtistFactory<PixelDock>("AfterimagePixelDocker"));
        KoDockRegistry::instance()->add(new ArtistFactory<ComicDock>("AfterimageComicDocker"));
    }
};
// Krita discovers the dock factories from this embedded service metadata.
K_PLUGIN_FACTORY_WITH_JSON(ArtistPluginFactory, "krita_afterimageartist.json", registerPlugin<ArtistPlugin>();)
#include "ArtistPlugin.moc"
