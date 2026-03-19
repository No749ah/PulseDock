import { Injectable } from '@nestjs/common'
import { InviteMemberDto } from './team.dto'

@Injectable()
export class TeamService {
  getMembers(_userId: string): object[] {
    // Stub — no DB table yet
    return []
  }

  inviteMember(_userId: string, dto: InviteMemberDto): object {
    return { message: 'Invitation sent', email: dto.email, role: dto.role }
  }

  removeMember(_userId: string, _memberId: string): object {
    return { message: 'Feature not yet available' }
  }
}
