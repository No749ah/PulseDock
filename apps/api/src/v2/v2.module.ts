import { Module } from '@nestjs/common';
import { V2MonitorsController } from './monitors/monitors.controller';
import { V2SystemController } from './system/system.controller';
import { V2AlertsController } from './alerts/alerts.controller';
import { V2ChecksController } from './checks/checks.controller';
import { V2IncidentsController } from './incidents/incidents.controller';
import { V2DeploymentsController } from './deployments/deployments.controller';
import { V2StatusPagesController } from './status-pages/status-pages.controller';
import { V2TagsController } from './tags/tags.controller';
import { V2FoldersController } from './folders/folders.controller';
import { MonitorsService } from '../monitors/monitors.service';
import { MonitorsCrudService } from '../monitors/monitors-crud.service';
import { MonitorsAnalyticsService } from '../monitors/monitors-analytics.service';
import { MonitorsSlaService } from '../monitors/monitors-sla.service';
import { MonitorsDiagnosticsService } from '../monitors/monitors-diagnostics.service';
import { MonitorsExportService } from '../monitors/monitors-export.service';
import { MonitorsComparisonService } from '../monitors/monitors-comparison.service';
import { ChecksService } from '../checks/checks.service';
import { AuditService } from '../common/audit.service';

/**
 * V2 API Module
 *
 * Provides enhanced v2 endpoints alongside stable v1 endpoints.
 * Key differences from v1:
 *   - Consistent envelope response format: { data, meta }
 *   - Pagination on list endpoints (page, limit, total)
 *   - Structured filtering and sorting query parameters
 *   - Extended error payloads with `code` and `details` fields
 *   - No breaking changes to v1 (both run concurrently)
 *
 * V2 surface:
 *   - GET /v2/monitors           — paginated monitors with filtering + sorting
 *   - GET /v2/alert-channels     — paginated alert channels with usage counts
 *   - GET /v2/checks             — paginated check history with date-range + level filters
 *   - GET /v2/system/info        — extended API metadata
 *   - GET /v2/system/versions    — version compatibility matrix
 *   - GET /v2/incidents          — paginated incidents with status/severity filtering
 *   - GET /v2/deployments        — paginated deployment events with service/env/status filtering
 *   - GET /v2/status-pages       — paginated status pages with subscriberCount + widgetCount
 *   - GET /v2/tags               — paginated tags with monitorCount, sortable by monitorCount
 *   - GET /v2/folders             — flat paginated folders with depth, path, stats (healthy/degraded/down)
 */
@Module({
  controllers: [V2MonitorsController, V2AlertsController, V2ChecksController, V2SystemController, V2IncidentsController, V2DeploymentsController, V2StatusPagesController, V2TagsController, V2FoldersController],
  providers: [MonitorsService, MonitorsCrudService, MonitorsAnalyticsService, MonitorsSlaService, MonitorsDiagnosticsService, MonitorsExportService, MonitorsComparisonService, ChecksService, AuditService],
})
export class V2Module {}
