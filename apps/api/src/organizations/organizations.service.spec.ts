import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Test } from '@nestjs/testing'
import { BadRequestException, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common'
import { OrganizationsService } from './organizations.service'
import { PrismaService } from '../common/prisma.service'
import { OrgRole } from '@prisma/client'

const makeOrg = (overrides = {}) => ({
  id: 'org-1',
  name: 'Acme Corp',
  slug: 'acme-corp',
  logoUrl: null,
  website: null,
  plan: 'free',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const makeMember = (overrides = {}) => ({
  id: 'member-1',
  userId: 'user-1',
  organizationId: 'org-1',
  role: OrgRole.OWNER,
  joinedAt: new Date(),
  ...overrides,
})

const makePrisma = () => ({
  organization: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  orgMember: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  orgInvite: {
    findUnique: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(),
})

describe('OrganizationsService', () => {
  let service: OrganizationsService
  let prisma: ReturnType<typeof makePrisma>

  beforeEach(async () => {
    prisma = makePrisma()
    const module = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile()
    service = module.get(OrganizationsService)
  })

  describe('createOrganization', () => {
    it('creates org and sets caller as OWNER', async () => {
      prisma.organization.findUnique.mockResolvedValue(null)
      const org = makeOrg()
      prisma.organization.create.mockResolvedValue(org)

      const result = await service.createOrganization('user-1', {
        name: 'Acme Corp',
        slug: 'acme-corp',
      })

      expect(prisma.organization.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            slug: 'acme-corp',
            members: { create: { userId: 'user-1', role: OrgRole.OWNER } },
          }),
        }),
      )
      expect(result).toEqual(org)
    })

    it('throws ConflictException if slug is taken', async () => {
      prisma.organization.findUnique.mockResolvedValue(makeOrg())
      await expect(
        service.createOrganization('user-1', { name: 'Other', slug: 'acme-corp' }),
      ).rejects.toBeInstanceOf(ConflictException)
    })
  })

  describe('getOrganizations', () => {
    it('returns organizations the user belongs to', async () => {
      const org = { ...makeOrg(), _count: { members: 2 } }
      prisma.orgMember.findMany.mockResolvedValue([{ organization: org }])
      const result = await service.getOrganizations('user-1')
      expect(result).toEqual([org])
    })
  })

  describe('updateOrganization', () => {
    it('updates org for OWNER', async () => {
      const member = makeMember({ role: OrgRole.OWNER })
      prisma.orgMember.findUnique.mockResolvedValue(member)
      const updated = makeOrg({ name: 'Updated' })
      prisma.organization.update.mockResolvedValue(updated)

      const result = await service.updateOrganization('org-1', 'user-1', { name: 'Updated' })
      expect(result.name).toBe('Updated')
    })

    it('throws ForbiddenException for MEMBER', async () => {
      prisma.orgMember.findUnique.mockResolvedValue(makeMember({ role: OrgRole.MEMBER }))
      await expect(
        service.updateOrganization('org-1', 'user-1', { name: 'Updated' }),
      ).rejects.toBeInstanceOf(ForbiddenException)
    })
  })

  describe('deleteOrganization', () => {
    it('deletes org for OWNER', async () => {
      prisma.orgMember.findUnique.mockResolvedValue(makeMember({ role: OrgRole.OWNER }))
      prisma.organization.delete.mockResolvedValue(makeOrg())
      await expect(service.deleteOrganization('org-1', 'user-1')).resolves.toBeUndefined()
    })

    it('throws ForbiddenException for non-OWNER', async () => {
      prisma.orgMember.findUnique.mockResolvedValue(makeMember({ role: OrgRole.ADMIN }))
      await expect(service.deleteOrganization('org-1', 'user-1')).rejects.toBeInstanceOf(ForbiddenException)
    })
  })

  describe('switchOrganization', () => {
    it('updates activeOrgId for valid member', async () => {
      prisma.orgMember.findUnique.mockResolvedValue(makeMember())
      prisma.user.update.mockResolvedValue({})
      await expect(service.switchOrganization('org-1', 'user-1')).resolves.toBeUndefined()
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { activeOrgId: 'org-1' } }),
      )
    })

    it('throws NotFoundException if not a member', async () => {
      prisma.orgMember.findUnique.mockResolvedValue(null)
      await expect(service.switchOrganization('org-1', 'user-1')).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('inviteMember', () => {
    it('adds existing user directly as member', async () => {
      prisma.orgMember.findUnique
        .mockResolvedValueOnce(makeMember({ role: OrgRole.ADMIN })) // requireRole
        .mockResolvedValueOnce(null) // not already member
      prisma.user.findUnique.mockResolvedValue({ id: 'user-2', email: 'jane@example.com' })
      prisma.orgMember.create.mockResolvedValue({})

      const result = await service.inviteMember('org-1', 'user-1', {
        email: 'jane@example.com',
        role: OrgRole.MEMBER,
      })
      expect(result).toEqual({ token: '' })
    })

    it('throws BadRequestException if user already a member', async () => {
      prisma.orgMember.findUnique
        .mockResolvedValueOnce(makeMember({ role: OrgRole.OWNER })) // requireRole
        .mockResolvedValueOnce(makeMember({ role: OrgRole.MEMBER })) // already member
      prisma.user.findUnique.mockResolvedValue({ id: 'user-2', email: 'existing@example.com' })

      await expect(
        service.inviteMember('org-1', 'user-1', { email: 'existing@example.com', role: OrgRole.MEMBER }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })
  })

  describe('acceptInvite', () => {
    it('joins org on valid invite', async () => {
      const invite = {
        id: 'invite-1',
        token: 'valid-token',
        organizationId: 'org-1',
        role: OrgRole.MEMBER,
        expiresAt: new Date(Date.now() + 86400000),
        email: 'jane@example.com',
        createdAt: new Date(),
      }
      prisma.orgInvite.findUnique.mockResolvedValue(invite)
      prisma.user.findUnique.mockResolvedValue({ id: 'user-2', email: 'jane@example.com' })
      prisma.orgMember.findUnique.mockResolvedValue(null)
      prisma.$transaction.mockResolvedValue([])
      prisma.organization.findUnique.mockResolvedValue(makeOrg())

      const result = await service.acceptInvite('valid-token', 'user-2')
      expect(result).toEqual(expect.objectContaining({ id: 'org-1' }))
    })

    it('throws BadRequestException on expired invite', async () => {
      prisma.orgInvite.findUnique.mockResolvedValue({
        token: 'expired-token',
        expiresAt: new Date(Date.now() - 1000),
      })
      await expect(service.acceptInvite('expired-token', 'user-1')).rejects.toBeInstanceOf(BadRequestException)
    })

    it('throws BadRequestException on invalid token', async () => {
      prisma.orgInvite.findUnique.mockResolvedValue(null)
      await expect(service.acceptInvite('bad-token', 'user-1')).rejects.toBeInstanceOf(BadRequestException)
    })
  })

  describe('checkSlug', () => {
    it('returns available:true when slug is free', async () => {
      prisma.organization.findUnique.mockResolvedValue(null)
      const result = await service.checkSlug('free-slug')
      expect(result).toEqual({ available: true })
    })

    it('returns available:false when slug is taken', async () => {
      prisma.organization.findUnique.mockResolvedValue(makeOrg())
      const result = await service.checkSlug('acme-corp')
      expect(result).toEqual({ available: false })
    })
  })

  describe('getOrganization', () => {
    it('returns org with members for a valid member', async () => {
      const ownerMember = makeMember({ role: OrgRole.OWNER })
      prisma.orgMember.findUnique.mockResolvedValue(ownerMember)
      const org = { ...makeOrg(), members: [ownerMember] }
      prisma.organization.findUnique.mockResolvedValue(org)
      const result = await service.getOrganization('org-1', 'user-1')
      expect(result.id).toBe('org-1')
    })

    it('throws NotFoundException for non-member', async () => {
      prisma.orgMember.findUnique.mockResolvedValue(null)
      await expect(service.getOrganization('org-1', 'user-1')).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('getMembers', () => {
    it('returns members for a valid member', async () => {
      const ownerMember = makeMember({ role: OrgRole.OWNER })
      prisma.orgMember.findUnique.mockResolvedValue(ownerMember) // requireMembership
      const members = [ownerMember]
      prisma.orgMember.findMany.mockResolvedValue(members)
      const result = await service.getMembers('org-1', 'user-1')
      expect(result).toHaveLength(1)
    })

    it('throws NotFoundException for non-member', async () => {
      prisma.orgMember.findUnique.mockResolvedValue(null)
      await expect(service.getMembers('org-1', 'user-3')).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('updateMemberRole', () => {
    it('updates role for OWNER requester', async () => {
      const ownerMember = makeMember({ userId: 'user-1', role: OrgRole.OWNER })
      const targetMember = makeMember({ userId: 'user-2', role: OrgRole.MEMBER })
      prisma.orgMember.findUnique
        .mockResolvedValueOnce(ownerMember) // requireRole
        .mockResolvedValueOnce(targetMember) // target member lookup
      const updated = { ...targetMember, role: OrgRole.ADMIN }
      prisma.orgMember.update.mockResolvedValue(updated)
      const result = await service.updateMemberRole('org-1', 'user-2', 'user-1', { role: OrgRole.ADMIN })
      expect(result.role).toBe(OrgRole.ADMIN)
    })

    it('throws ForbiddenException when trying to change OWNER role', async () => {
      const ownerRequester = makeMember({ userId: 'user-1', role: OrgRole.OWNER })
      const ownerTarget = makeMember({ userId: 'user-2', role: OrgRole.OWNER })
      prisma.orgMember.findUnique
        .mockResolvedValueOnce(ownerRequester)
        .mockResolvedValueOnce(ownerTarget)
      await expect(
        service.updateMemberRole('org-1', 'user-2', 'user-1', { role: OrgRole.MEMBER }),
      ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('throws ForbiddenException when trying to assign OWNER role', async () => {
      const ownerRequester = makeMember({ userId: 'user-1', role: OrgRole.OWNER })
      const memberTarget = makeMember({ userId: 'user-2', role: OrgRole.MEMBER })
      prisma.orgMember.findUnique
        .mockResolvedValueOnce(ownerRequester)
        .mockResolvedValueOnce(memberTarget)
      await expect(
        service.updateMemberRole('org-1', 'user-2', 'user-1', { role: OrgRole.OWNER }),
      ).rejects.toBeInstanceOf(ForbiddenException)
    })
  })

  describe('removeMember', () => {
    it('removes a member (OWNER removing MEMBER)', async () => {
      const ownerRequester = makeMember({ userId: 'user-1', role: OrgRole.OWNER })
      const memberTarget = makeMember({ userId: 'user-2', role: OrgRole.MEMBER })
      prisma.orgMember.findUnique
        .mockResolvedValueOnce(ownerRequester) // requireRole
        .mockResolvedValueOnce(memberTarget) // target lookup
      prisma.orgMember.delete.mockResolvedValue(memberTarget)
      await service.removeMember('org-1', 'user-2', 'user-1')
      expect(prisma.orgMember.delete).toHaveBeenCalled()
    })

    it('throws ForbiddenException when trying to remove the OWNER', async () => {
      const ownerRequester = makeMember({ userId: 'user-1', role: OrgRole.OWNER })
      const ownerTarget = makeMember({ userId: 'user-2', role: OrgRole.OWNER })
      prisma.orgMember.findUnique
        .mockResolvedValueOnce(ownerRequester)
        .mockResolvedValueOnce(ownerTarget)
      await expect(service.removeMember('org-1', 'user-2', 'user-1')).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('throws NotFoundException when member does not exist', async () => {
      const ownerRequester = makeMember({ userId: 'user-1', role: OrgRole.OWNER })
      prisma.orgMember.findUnique
        .mockResolvedValueOnce(ownerRequester)
        .mockResolvedValueOnce(null) // target not found
      await expect(service.removeMember('org-1', 'user-99', 'user-1')).rejects.toBeInstanceOf(NotFoundException)
    })
  })
})
