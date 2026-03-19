import { Test, TestingModule } from '@nestjs/testing'
import { TeamService } from './team.service'
import { InviteMemberDto } from './team.dto'

describe('TeamService', () => {
  let service: TeamService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TeamService],
    }).compile()

    service = module.get<TeamService>(TeamService)
  })

  it('getMembers returns empty array', () => {
    const result = service.getMembers('user-123')
    expect(result).toEqual([])
  })

  it('inviteMember returns invitation confirmation', () => {
    const dto: InviteMemberDto = { email: 'test@example.com', role: 'Editor' }
    const result = service.inviteMember('user-123', dto) as Record<string, string>
    expect(result.message).toBe('Invitation sent')
    expect(result.email).toBe('test@example.com')
    expect(result.role).toBe('Editor')
  })

  it('removeMember returns not available message', () => {
    const result = service.removeMember('user-123', 'member-456') as Record<string, string>
    expect(result.message).toBe('Feature not yet available')
  })
})
