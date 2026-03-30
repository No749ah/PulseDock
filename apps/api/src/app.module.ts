import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CsrfMiddleware } from './common/csrf.middleware';
import { ScheduleModule } from '@nestjs/schedule';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AuthService } from './auth/auth.service';
import { AuthController } from './auth/auth.controller';
import { MonitorsController } from './monitors/monitors.controller';
import { MonitorsAnalyticsController } from './monitors/monitors-analytics.controller';
import { MonitorsSlaController } from './monitors/monitors-sla.controller';
import { MonitorsDiagnosticsController } from './monitors/monitors-diagnostics.controller';
import { MonitorsExportController } from './monitors/monitors-export.controller';
import { MonitorsComparisonController } from './monitors/monitors-comparison.controller';
import { MonitorsRunsController } from './monitors/monitors-runs.controller';
import { MonitorsAlertsController } from './monitors/monitors-alerts.controller';
import { MonitorsDetailsController } from './monitors/monitors-details.controller';
import { MonitorsStateController } from './monitors/monitors-state.controller';
import { AnnotationsController } from './monitors/annotations.controller';
import { ServiceGroupsController } from './monitors/service-groups.controller';
import { ServiceGroupsService } from './monitors/service-groups.service';
import { MonitorsService } from './monitors/monitors.service';
import { MonitorsCrudService } from './monitors/monitors-crud.service';
import { MonitorsAnalyticsService } from './monitors/monitors-analytics.service';
import { MonitorsSlaService } from './monitors/monitors-sla.service';
import { MonitorsDiagnosticsService } from './monitors/monitors-diagnostics.service';
import { MonitorsExportService } from './monitors/monitors-export.service';
import { MonitorsComparisonService } from './monitors/monitors-comparison.service';
import { VersionDetectionService } from './monitors/version-detection.service';
import { AlertsService } from './alerts/alerts.service';
import { AlertsController } from './alerts/alerts.controller';
import { AlertRoutingController } from './alerts/alert-routing.controller';
import { ChecksService } from './checks/checks.service';
import { ChecksScheduler } from './checks/checks.scheduler';
import { HeartbeatController } from './checks/heartbeat.controller';
import { PluginsController } from './checks/plugins.controller';
import { DashboardController } from './dashboard/dashboard.controller';
import { PublicDashboardController } from './dashboard/public.controller';
import { AdminController } from './users/admin.controller';
import { FoldersController } from './users/folders.controller';
import { RolesGuard } from './common/roles.guard';
import { PrismaService } from './common/prisma.service';
import { InvitesController } from './users/invites.controller';
import { BootstrapService } from './common/bootstrap.service';
import { AuditService } from './common/audit.service';
import { MailerService } from './common/mailer.service';
import { MetricsService } from './common/metrics.service';
import { ApiKeysService } from './apikeys/apikeys.service';
import { ApiKeysController } from './apikeys/apikeys.controller';
import { RealtimeModule } from './realtime/realtime.module';
import { V2MonitorsController } from './v2/monitors/monitors.controller';
import { V2SystemController } from './v2/system/system.controller';
import { V2AlertsController } from './v2/alerts/alerts.controller';
import { V2ChecksController } from './v2/checks/checks.controller';
import { TagsController } from './tags/tags.controller';
import { ToolRegistryController } from './tool-registry/tool-registry.controller';
import { TagsService } from './tags/tags.service';
import { NotificationsController } from './notifications/notifications.controller';
import { NotificationsService } from './notifications/notifications.service';
import { StatusPagesController } from './status-pages/status-pages.controller';
import { StatusPagesService } from './status-pages/status-pages.service';
import { WidgetDataResolverService } from './status-pages/widget-data-resolver.service';
import { StatusPageSubscriberService } from './status-pages/subscriber.service';
import { MaintenanceController } from './maintenance/maintenance.controller';
import { MaintenanceService } from './maintenance/maintenance.service';
import { IncidentsController } from './incidents/incidents.controller';
import { IncidentsService } from './incidents/incidents.service';
import { AgentController } from './agent/agent.controller';
import { AgentService } from './agent/agent.service';
import { ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';
import { TeamController } from './team/team.controller';
import { TeamService } from './team/team.service';
import { OrganizationsController } from './organizations/organizations.controller';
import { OrganizationsService } from './organizations/organizations.service';
import { SettingsController } from './settings/settings.controller';
import { SettingsService } from './settings/settings.service';
import { BackupService } from './settings/backup.service';
import { PlanController } from './settings/plan.controller';
import { PlanService } from './settings/plan.service';
import { FeedbackController } from './feedback/feedback.controller';
import { GrafanaController } from './grafana/grafana.controller';
import { GrafanaService } from './grafana/grafana.service';
import { RedisCacheService } from './common/redis-cache.service';
import { DemoController } from './demo/demo.controller';
import { DemoService } from './demo/demo.service';
import { EscalationController } from './escalation/escalation.controller';
import { EscalationService } from './escalation/escalation.service';
import { SearchController } from './search/search.controller';
import { SearchService } from './search/search.service';
import { DeploymentsController, PublicDeploymentsController } from './deployments/deployments.controller';
import { DeploymentsService } from './deployments/deployments.service';
import { PlaybooksModule } from './playbooks/playbooks.module';
import { PlaybooksController } from './playbooks/playbooks.controller';
import { PlaybooksService } from './playbooks/playbooks.service';
import { DependenciesController } from './dependencies/dependencies.controller';
import { DependenciesService } from './dependencies/dependencies.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    JwtModule.register({}),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    RealtimeModule,
    PlaybooksModule,
  ],
  controllers: [
    AppController,
    AuthController,
    MonitorsController,
    MonitorsAnalyticsController,
    MonitorsSlaController,
    MonitorsDiagnosticsController,
    MonitorsExportController,
    MonitorsComparisonController,
    MonitorsRunsController,
    MonitorsAlertsController,
    MonitorsDetailsController,
    MonitorsStateController,
    AlertsController,
    AlertRoutingController,
    HeartbeatController,
    PluginsController,
    DashboardController,
    PublicDashboardController,
    AdminController,
    FoldersController,
    InvitesController,
    ApiKeysController,
    V2MonitorsController,
    V2SystemController,
    V2AlertsController,
    V2ChecksController,
    TagsController,
    ToolRegistryController,
    NotificationsController,
    StatusPagesController,
    MaintenanceController,
    IncidentsController,
    AgentController,
    ReportsController,
    TeamController,
    SettingsController,
    PlanController,
    FeedbackController,
    GrafanaController,

    OrganizationsController,
    DemoController,
    EscalationController,
    SearchController,
    AnnotationsController,
    ServiceGroupsController,
    DeploymentsController,
    PublicDeploymentsController,
    DependenciesController,
    PlaybooksController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    PrismaService,
    AuditService,
    MailerService,
    MetricsService,
    BootstrapService,
    AuthService,
    MonitorsService,
    MonitorsCrudService,
    MonitorsAnalyticsService,
    MonitorsSlaService,
    MonitorsDiagnosticsService,
    MonitorsExportService,
    MonitorsComparisonService,
    VersionDetectionService,
    AlertsService,
    ChecksService,
    ChecksScheduler,
    RolesGuard,
    ApiKeysService,
    TagsService,
    NotificationsService,
    StatusPagesService,
    WidgetDataResolverService,
    StatusPageSubscriberService,
    MaintenanceService,
    IncidentsService,
    AgentService,
    ReportsService,
    TeamService,
    SettingsService,
    BackupService,
    PlanService,
    GrafanaService,

    OrganizationsService,
    RedisCacheService,
    DemoService,
    EscalationService,
    SearchService,
    ServiceGroupsService,
    DeploymentsService,
    DependenciesService,
    PlaybooksService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CsrfMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
