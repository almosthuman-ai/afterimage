// SPDX-FileCopyrightText: 2026 Afterimage contributors
// SPDX-License-Identifier: GPL-3.0-or-later
#include "AfterimageDock.h"
#include <kpluginfactory.h>
#include <KoDockFactoryBase.h>
#include <KoDockRegistry.h>

class AfterimageFactory : public KoDockFactoryBase
{
public:
    QString id() const override { return "AfterimageDocker"; }
    DockPosition defaultDockPosition() const override { return DockRight; }
    QDockWidget *createDockWidget() override {
        auto *dock = new AfterimageDock;
        dock->setObjectName(id());
        return dock;
    }
};

class AfterimagePlugin : public QObject
{
    Q_OBJECT
public:
    AfterimagePlugin(QObject *parent, const QVariantList &) : QObject(parent) {
        KoDockRegistry::instance()->add(new AfterimageFactory);
    }
};

K_PLUGIN_FACTORY_WITH_JSON(AfterimagePluginFactory, "krita_afterimage.json", registerPlugin<AfterimagePlugin>();)
#include "AfterimagePlugin.moc"
