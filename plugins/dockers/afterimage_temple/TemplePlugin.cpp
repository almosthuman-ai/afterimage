// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#include "TempleDock.h"
#include "TempleService.h"
#include <kpluginfactory.h>
#include <KoDockFactoryBase.h>
#include <KoDockRegistry.h>

class TempleFactory : public KoDockFactoryBase
{
public:
    QString id() const override { return QStringLiteral("AfterimageTempleDocker"); }
    DockPosition defaultDockPosition() const override { return DockMinimized; }
    QDockWidget *createDockWidget() override {
        auto *dock = new TempleDock;
        dock->setObjectName(id());
        return dock;
    }
};

class TemplePlugin : public QObject
{
    Q_OBJECT
public:
    TemplePlugin(QObject *parent, const QVariantList &) : QObject(parent) {
        TempleService::instance();
        KoDockRegistry::instance()->add(new TempleFactory);
    }
};
K_PLUGIN_FACTORY_WITH_JSON(TemplePluginFactory, "krita_afterimage_temple.json", registerPlugin<TemplePlugin>();)
#include "TemplePlugin.moc"
