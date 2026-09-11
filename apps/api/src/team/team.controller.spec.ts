import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Test } from '@nestjs/testing'
import { TeamController } from './team.controller'
import { TeamService } from './team.service'
import { TeamRole } from './team.dto'
import { AuthGuard } from '../common/auth.guard'

const makeTeamService = () => ({
  getInviteByToken: vi.fn(),
  acceptInvite: vi.fn(),
  getMembers: vi.fn(),
  getInvites: vi.fn(),
  inviteMember: vi.fn(),
  updateMemberRole: vi.fn(),
  removeMember: vi.fn(),
  cancelInvite: vi.fn(),
})

const req = (id = 'user-1') => ({ user: { id } } as never)

describe('TeamController', () => {
  let controller: TeamController
  let svc: ReturnType<typeof makeTeamService>

  beforeEach(async () => {
    svc = makeTeamService()
    const module = await Test.createTestingModule({
      controllers: [TeamController],
      providers: [{ provide: TeamService, useValue: svc }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .compile()
    controller = module.get(TeamController)
  })

  describe('getInviteByToken', () => {
    it('returns invite details for a valid token', async () => {
      const invite = { email: 'a@b.com', role: 'VIEWER', inviter: 'Alice' }
      svc.getInviteByToken.mockResolvedValue(invite)
      const result = await controller.getInviteByToken('tok-1')
      expect(svc.getInviteByToken).toHaveBeenCalledWith('tok-1')
      expect(result).toMatchObject({ email: 'a@b.com' })
    })
  })

  describe('acceptInvite', () => {
    it('accepts invite and returns member record', async () => {
      const member = { id: 'm-1', role: 'VIEWER' }
      svc.acceptInvite.mockResolvedValue(member)
      const result = await controller.acceptInvite('tok-1', req())
      expect(svc.acceptInvite).toHaveBeenCalledWith('tok-1', 'user-1')
      expect(result).toMatchObject({ id: 'm-1' })
    })
  })

  describe('getMembers', () => {
    it('returns list of team members', async () => {
      const members = [{ id: 'm-1', role: 'EDITOR' }, { id: 'm-2', role: 'VIEWER' }]
      svc.getMembers.mockResolvedValue(members)
      const result = await controller.getMembers(req())
      expect(svc.getMembers).toHaveBeenCalledWith('user-1')
      expect(result).toHaveLength(2)
    })

    it('returns empty array when no members', async () => {
      svc.getMembers.mockResolvedValue([])
      const result = await controller.getMembers(req())
      expect(result).toEqual([])
    })
  })

  describe('getInvites', () => {
    it('returns pending invites', async () => {
      const invites = [{ id: 'i-1', email: 'b@c.com', role: 'EDITOR' }]
      svc.getInvites.mockResolvedValue(invites)
      const result = await controller.getInvites(req())
      expect(svc.getInvites).toHaveBeenCalledWith('user-1')
      expect(result).toHaveLength(1)
    })
  })

  describe('inviteMember', () => {
    it('sends invite and returns result', async () => {
      const inviteResult = { kind: 'invite_created', id: 'i-1' }
      svc.inviteMember.mockResolvedValue(inviteResult)
      const dto = { email: 'c@d.com', role: TeamRole.VIEWER }
      const result = await controller.inviteMember(req(), dto)
      expect(svc.inviteMember).toHaveBeenCalledWith('user-1', dto)
      expect(result).toMatchObject({ kind: 'invite_created' })
    })

    it('creates member directly when user already exists', async () => {
      const inviteResult = { kind: 'member_created', id: 'm-new' }
      svc.inviteMember.mockResolvedValue(inviteResult)
      const dto = { email: 'existing@test.com', role: TeamRole.ADMIN }
      const result = await controller.inviteMember(req(), dto)
      expect(result).toMatchObject({ kind: 'member_created' })
    })
  })

  describe('updateMemberRole', () => {
    it('updates role and returns updated member', async () => {
      const updated = { id: 'm-1', role: 'ADMIN' }
      svc.updateMemberRole.mockResolvedValue(updated)
      const dto = { role: TeamRole.ADMIN }
      const result = await controller.updateMemberRole(req(), 'm-1', dto)
      expect(svc.updateMemberRole).toHaveBeenCalledWith('user-1', 'm-1', dto)
      expect(result).toMatchObject({ role: 'ADMIN' })
    })
  })

  describe('removeMember', () => {
    it('removes member and returns ok', async () => {
      svc.removeMember.mockResolvedValue({ ok: true })
      const result = await controller.removeMember(req(), 'm-1')
      expect(svc.removeMember).toHaveBeenCalledWith('user-1', 'm-1')
      expect(result).toMatchObject({ ok: true })
    })
  })

  describe('cancelInvite', () => {
    it('cancels pending invite and returns ok', async () => {
      svc.cancelInvite.mockResolvedValue({ ok: true })
      const result = await controller.cancelInvite(req(), 'i-1')
      expect(svc.cancelInvite).toHaveBeenCalledWith('user-1', 'i-1')
      expect(result).toMatchObject({ ok: true })
    })
  })
})
