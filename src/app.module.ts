import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join, resolve } from 'path';
import { trimPath } from './common/trim.util';
import { ApiController } from './api/api.controller';
import { ApiFullController } from './api/api-full.controller';
import { ApiBridgeService } from './api/api-bridge.service';
import { InstanceContextInterceptor } from './api/instance-context.interceptor';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { SessionService } from './auth/session.service';
import { UsersService } from './auth/users.service';
import { FccConfigService } from './config/fcc-config.service';
import { PathsService } from './config/paths.service';
import { InstancesService } from './instances/instances.service';
import { InstanceSummaryService } from './instances/instance-summary.service';
import { InstanceBootstrapService } from './instances/instance-bootstrap.service';
import { InstanceAutostartService } from './instances/instance-autostart.service';
import { LocaleService } from './locale/locale.service';
import { MaintenanceService } from './maintenance/maintenance.service';
import { AuditLogService } from './maintenance/audit-log.service';
import { ModsService } from './mods/mods.service';
import { DispatchService } from './ops/dispatch.service';
import { RconService } from './ops/rcon.service';
import { RuntimeService } from './ops/runtime.service';
import { SaveInspectService } from './ops/save-inspect/save-inspect.service';
import { ModPortalService } from './ops/mod-portal/mod-portal.service';
import { ServerOpsService } from './ops/server/server-ops.service';
import { MapGenOpsService } from './ops/map-gen/map-gen-ops.service';
import { SavesOpsService } from './ops/saves/saves-ops.service';
import { FilesOpsService } from './ops/files/files-ops.service';
import { ModSettingsSchemaService } from './ops/files/mod-settings-schema.service';
import { PlayersOpsService } from './ops/players/players-ops.service';
import { ModsOpsService } from './ops/mods/mods-ops.service';
import { ModsJobService } from './ops/mods/mods-job.service';
import { ModPlanService } from './ops/mods/mod-plan.service';
import { ModpacksOpsService } from './ops/modpacks/modpacks-ops.service';
import { MapPresetsOpsService } from './ops/map-presets/map-presets-ops.service';
import { FactorioUpdateService } from './ops/factorio-update/factorio-update.service';
import { AnnouncementsOpsService } from './ops/announcements/announcements-ops.service';
import { ProgramOpsService } from './ops/program/program-ops.service';
import { CommandsCatalogService } from './ops/commands-catalog.service';
import { InstancePropagateService } from './ops/instance-propagate.service';
import { InstanceHistoryService } from './ops/instance-history.service';
import { PagesController } from './pages/pages.controller';
import { LogRotationService } from './logging/log-rotation.service';
import { WebPanelLogService } from './logging/web-panel-log.service';
import { WebPanelEventLogService } from './logging/web-panel-event-log.service';
import { PanelStartupLogService } from './logging/panel-startup-log.service';
import { WebPanelListenerService } from './http/web-panel-listener.service';
import { FirewallService } from './ops/firewall/firewall.service';

const fccRoot = resolve(trimPath(process.env.FCC_ROOT_DIR) || process.cwd());
const publicAssets = join(fccRoot, 'public', 'assets');
const reactAssets = join(fccRoot, 'client', 'dist', 'vite-assets');
const clientDist = join(fccRoot, 'client', 'dist');

@Module({
  imports: [
    // Static images (map-gen, server-list, …) at /assets/*
    ServeStaticModule.forRoot({
      rootPath: publicAssets,
      serveRoot: '/assets',
    }),
    // Vite build chunks at /vite-assets/* (when client is built)
    ServeStaticModule.forRoot({
      rootPath: reactAssets,
      serveRoot: '/vite-assets',
      serveStaticOptions: { fallthrough: true },
    }),
    // PWA icons, favicon, web manifest, and other Vite public/ assets at /*
    ServeStaticModule.forRoot({
      rootPath: clientDist,
      serveRoot: '/',
      serveStaticOptions: {
        index: false,
        fallthrough: true,
        setHeaders(res, filePath) {
          if (filePath.endsWith('site.webmanifest')) {
            res.setHeader(
              'Content-Type',
              'application/manifest+json; charset=UTF-8',
            );
          }
        },
      },
    }),
  ],
  controllers: [
    PagesController,
    ApiController,
    ApiFullController,
    AuthController,
  ],
  providers: [
    PathsService,
    FccConfigService,
    UsersService,
    SessionService,
    InstancesService,
    InstanceSummaryService,
    InstanceBootstrapService,
    InstanceAutostartService,
    LocaleService,
    RconService,
    RuntimeService,
    DispatchService,
    ApiBridgeService,
    MaintenanceService,
    AuditLogService,
    ModsService,
    SaveInspectService,
    ModPortalService,
    FirewallService,
    ServerOpsService,
    MapGenOpsService,
    SavesOpsService,
    FilesOpsService,
    ModSettingsSchemaService,
    PlayersOpsService,
    ModsOpsService,
    ModPlanService,
    ModsJobService,
    ModpacksOpsService,
    MapPresetsOpsService,
    FactorioUpdateService,
    CommandsCatalogService,
    AnnouncementsOpsService,
    ProgramOpsService,
    InstancePropagateService,
    InstanceHistoryService,
    LogRotationService,
    WebPanelLogService,
    WebPanelEventLogService,
    PanelStartupLogService,
    WebPanelListenerService,
    AuthGuard,
    {
      provide: APP_INTERCEPTOR,
      useClass: InstanceContextInterceptor,
    },
  ],
})
export class AppModule {}
