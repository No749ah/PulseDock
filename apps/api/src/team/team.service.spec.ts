import { Test, TestingModule } from '@nestjs/testing'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { TeamService } from './team.service'
import { PrismaService } from '../common/prisma.service'
import { TeamRole } from './team.dto'

const mockPrisma = {
  teamMember: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  teamInvite: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
}

describe('TeamService', () => {
  let service: TeamService

  beforeEach(async () => {
    vi.clearAllMocks()
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile()

    service = module.get<TeamService>(TeamService)
  })

  it('getMembers returns list from prisma', async () => {
    const members = [{ id: 'm1', ownerId: 'u1', userId: 'u2', role: TeamRole.EDITOR, user: { id: 'u2', email: 'a@b.com', displayName: null } }]
    mockPrisma.teamMember.findMany.mockResolvedValue(members)
    const result = await service.getMembers('u1')
    expect(result).toEqual(members)
    expect(mockPrisma.teamMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: 'u1' } }),
    )
  })

  it('getInvites returns non-expired, pending invites', async () => {
    const invites = [{ id: 'i1', ownerId: 'u1', email: 'a@b.com', role: TeamRole.VIEWER }]
    mockPrisma.teamInvite.findMany.mockResolvedValue(invites)
    const result = await service.getInvites('u1')
    expect(result).toEqual(invites)
    expect(mockPrisma.teamInvite.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ ownerId: 'u1', acceptedAt: null }) }),
    )
  })

  it('inviteMember creates TeamMember if user exists', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u2', email: 'b@b.com' })
    mockPrisma.teamMember.findUnique.mockResolvedValue(null)
    const created = { id: 'm1', ownerId: 'u1', userId: 'u2', role: TeamRole.EDITOR, user: { id: 'u2', email: 'b@b.com', displayName: null } }
    mockPrisma.teamMember.create.mockResolvedValue(created)
    const result = await service.inviteMember('u1', { email: 'b@b.com', role: TeamRole.EDITOR })
    expect(result.type).toBe('member')
    expect(result.data).toEqual(created)
  })

  it('inviteMember creates TeamInvite if user does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)
    const invite = { id: 'i1', ownerId: 'u1', email: 'new@b.com', role: TeamRole.VIEWER, token: 'tok', expiresAt: new Date() }
    mockPrisma.teamInvite.create.mockResolvedValue(invite)
    const result = await service.inviteMember('u1', { email: 'new@b.com', role: TeamRole.VIEWER })
    expect(result.type).toBe('invite')
    expect(result.data).toEqual(invite)
  })

  it('inviteMember throws BadRequest when assigning OWNER role', async () => {
    await expect(service.inviteMember('u1', { email: 'x@b.com', role: TeamRole.OWNER })).rejects.toThrow(BadRequestException)
  })

  it('updateMemberRole updates role successfully', async () => {
    mockPrisma.teamMember.findFirst.mockResolvedValue({ id: 'm1', ownerId: 'u1', role: TeamRole.EDITOR })
    const updated = { id: 'm1', role: TeamRole.ADMIN, user: { id: 'u2', email: 'a@b.com', displayName: null } }
    mockPrisma.teamMember.update.mockResolvedValue(updated)
    const result = await service.updateMemberRole('u1', 'm1', { role: TeamRole.ADMIN })
    expect(result.role).toBe(TeamRole.ADMIN)
  })

  it('removeMember throws NotFoundException if member not found', async () => {
    mockPrisma.teamMember.findFirst.mockResolvedValue(null)
    await expect(service.removeMember('u1', 'nonexistent')).rejects.toThrow(NotFoundException)
  })

  it('cancelInvite deletes invite and returns message', async () => {
    mockPrisma.teamInvite.findFirst.mockResolvedValue({ id: 'i1', ownerId: 'u1' })
    mockPrisma.teamInvite.delete.mockResolvedValue({ id: 'i1' })
    const result = await service.cancelInvite('u1', 'i1')
    expect(result.message).toBe('Invite cancelled')
    expect(mockPrisma.teamInvite.delete).toHaveBeenCalledWith({ where: { id: 'i1' } })
  })
})
