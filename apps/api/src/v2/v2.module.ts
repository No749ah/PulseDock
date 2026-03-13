import { Module } from '@nestjs/common';
import { V2MonitorsController } from './monitors/monitors.controller';
import { V2SystemController } from './system/system.controller';
import { V2AlertsController } from './alerts/alerts.controller';
import { V2ChecksController } from './checks/checks.controller';
import { MonitorsService } from '../monitors/monitors.service';
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
 */
@Module({
  controllers: [V2MonitorsController, V2AlertsController, V2ChecksController, V2SystemController],
  providers: [MonitorsService, ChecksService, AuditService],
})
export class V2Module {}
