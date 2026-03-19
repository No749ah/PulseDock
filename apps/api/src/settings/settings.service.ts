import { Injectable } from '@nestjs/common'
import { UpdateRetentionDto } from './settings.dto'

// Stub: in-memory retention config (can be upgraded to DB later)
let currentRetentionDays: 7 | 30 | 90 | 365 = 90

@Injectable()
export class SettingsService {
  getRetention(): { retentionDays: number } {
    return { retentionDays: currentRetentionDays }
  }

  updateRetention(dto: UpdateRetentionDto): { retentionDays: number; message: string } {
    currentRetentionDays = dto.retentionDays
    return { retentionDays: currentRetentionDays, message: 'Retention settings updated' }
  }
}
