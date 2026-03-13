import { Module } from '@nestjs/common';
import { V2MonitorsController } from './monitors/monitors.controller';
import { V2SystemController } from './system/system.controller';
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
 */
@Module({
  controllers: [V2MonitorsController, V2SystemController],
  providers: [MonitorsService, ChecksService, AuditService],
})
export class V2Module {}
