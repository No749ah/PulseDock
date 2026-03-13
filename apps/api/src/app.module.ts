import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AuthService } from './auth/auth.service';
import { AuthController } from './auth/auth.controller';
import { MonitorsController } from './monitors/monitors.controller';
import { MonitorsService } from './monitors/monitors.service';
import { AlertsService } from './alerts/alerts.service';
import { AlertsController } from './alerts/alerts.controller';
import { ChecksService } from './checks/checks.service';
import { ChecksScheduler } from './checks/checks.scheduler';
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

@Module({
  imports: [
    ScheduleModule.forRoot(),
    JwtModule.register({}),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    RealtimeModule,
  ],
  controllers: [
    AppController,
    AuthController,
    MonitorsController,
    AlertsController,
    DashboardController,
    PublicDashboardController,
    AdminController,
    FoldersController,
    InvitesController,
    ApiKeysController,
    V2MonitorsController,
    V2SystemController,
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
    AlertsService,
    ChecksService,
    ChecksScheduler,
    RolesGuard,
    ApiKeysService,
  ],
})
export class AppModule {}
