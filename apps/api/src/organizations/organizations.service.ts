import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common'
import { PrismaService } from '../common/prisma.service'
import { OrgRole, Organization, OrgMember } from '@prisma/client'
import { CreateOrganizationDto, UpdateOrganizationDto, InviteOrgMemberDto, UpdateOrgMemberRoleDto } from './organizations.dto'

type OrgWithMemberCount = Organization & { _count: { members: number } }
type OrgMemberWithUser = OrgMember & {
  user: { id: string; email: string; displayName: string | null }
}

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lists all organizations the user belongs to, with member count.
   * @param userId - Authenticated user's ID
   * @returns Array of organizations with member counts
   */
  async getOrganizations(userId: string): Promise<OrgWithMemberCount[]> {
    const memberships = await this.prisma.orgMember.findMany({
      where: { userId },
      include: {
        organization: {
          include: { _count: { select: { members: true } } },
        },
      },
      orderBy: { joinedAt: 'asc' },
    })
    return memberships.map((m) => m.organization)
  }

  /**
   * Checks if a slug is available for a new organization.
   * @param slug - Slug to check
   * @returns { available: boolean }
   */
  async checkSlug(slug: string): Promise<{ available: boolean }> {
    const existing = await this.prisma.organization.findUnique({ where: { slug } })
    return { available: !existing }
  }

  /**
   * Creates a new organization and sets the creator as OWNER.
   * @param userId - Authenticated user's ID
   * @param dto - Organization creation data
   * @returns The created organization
   * @throws ConflictException if slug is already taken
   */
  async createOrganization(userId: string, dto: CreateOrganizationDto): Promise<Organization> {
    const existing = await this.prisma.organization.findUnique({ where: { slug: dto.slug } })
    if (existing) throw new ConflictException(`Slug "${dto.slug}" is already taken`)

    const org = await this.prisma.organization.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        logoUrl: dto.logoUrl,
        website: dto.website,
        members: {
          create: { userId, role: OrgRole.OWNER },
        },
      },
    })
    return org
  }

  /**
   * Gets a single organization by ID, ensuring the requester is a member.
   * @param orgId - Organization ID
   * @param userId - Authenticated user's ID
   * @returns Organization with members list
   * @throws NotFoundException if org not found or user is not a member
   */
  async getOrganization(orgId: string, userId: string): Promise<Organization & { members: OrgMemberWithUser[] }> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        members: {
          include: { user: { select: { id: true, email: true, displayName: true } } },
          orderBy: { joinedAt: 'asc' },
        },
      },
    })
    if (!org) throw new NotFoundException('Organization not found')

    const isMember = org.members.some((m) => m.userId === userId)
    if (!isMember) throw new NotFoundException('Organization not found')

    return org
  }

  /**
   * Updates organization settings (OWNER or ADMIN only).
   * @param orgId - Organization ID
   * @param userId - Authenticated user's ID
   * @param dto - Fields to update
   * @returns Updated organization
   * @throws ForbiddenException if user lacks ADMIN role
   */
  async updateOrganization(orgId: string, userId: string, dto: UpdateOrganizationDto): Promise<Organization> {
    await this.requireRole(orgId, userId, [OrgRole.OWNER, OrgRole.ADMIN])
    return this.prisma.organization.update({
      where: { id: orgId },
      data: dto,
    })
  }

  /**
   * Deletes an organization (OWNER only).
   * @param orgId - Organization ID
   * @param userId - Authenticated user's ID
   * @throws ForbiddenException if user is not OWNER
   */
  async deleteOrganization(orgId: string, userId: string): Promise<void> {
    await this.requireRole(orgId, userId, [OrgRole.OWNER])
    await this.prisma.organization.delete({ where: { id: orgId } })
  }

  /**
   * Sets the user's active organization (for workspace switching).
   * @param orgId - Organization ID to switch to
   * @param userId - Authenticated user's ID
   * @throws NotFoundException if user is not a member
   */
  async switchOrganization(orgId: string, userId: string): Promise<void> {
    const member = await this.prisma.orgMember.findUnique({
      where: { userId_organizationId: { userId, organizationId: orgId } },
    })
    if (!member) throw new NotFoundException('Organization not found')

    await this.prisma.user.update({
      where: { id: userId },
      data: { activeOrgId: orgId },
    })
  }

  /**
   * Invites a user to the organization by email (OWNER or ADMIN only).
   * @param orgId - Organization ID
   * @param userId - Authenticated user's ID (must be OWNER/ADMIN)
   * @param dto - Email and role for invitation
   * @returns The created invite token
   * @throws ForbiddenException if user lacks permission
   * @throws BadRequestException if user is already a member
   */
  async inviteMember(orgId: string, userId: string, dto: InviteOrgMemberDto): Promise<{ token: string }> {
    await this.requireRole(orgId, userId, [OrgRole.OWNER, OrgRole.ADMIN])

    // Check if already a member
    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (existingUser) {
      const member = await this.prisma.orgMember.findUnique({
        where: { userId_organizationId: { userId: existingUser.id, organizationId: orgId } },
      })
      if (member) throw new BadRequestException('User is already a member of this organization')
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    // If user exists, add them directly
    if (existingUser) {
      await this.prisma.orgMember.create({
        data: { userId: existingUser.id, organizationId: orgId, role: dto.role },
      })
      return { token: '' }
    }

    const invite = await this.prisma.orgInvite.create({
      data: {
        email: dto.email,
        organizationId: orgId,
        role: dto.role,
        expiresAt,
      },
    })
    return { token: invite.token }
  }

  /**
   * Accepts an organization invite by token, adding the user as a member.
   * @param token - Invite token
   * @param userId - Authenticated user's ID
   * @throws BadRequestException if token is invalid or expired
   */
  async acceptInvite(token: string, userId: string): Promise<Organization> {
    const invite = await this.prisma.orgInvite.findUnique({ where: { token } })
    if (!invite) throw new BadRequestException('Invalid invite token')
    if (invite.expiresAt < new Date()) throw new BadRequestException('Invite has expired')

    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('User not found')

    // Check if already a member
    const existing = await this.prisma.orgMember.findUnique({
      where: { userId_organizationId: { userId, organizationId: invite.organizationId } },
    })
    if (existing) throw new BadRequestException('You are already a member of this organization')

    await this.prisma.$transaction([
      this.prisma.orgMember.create({
        data: { userId, organizationId: invite.organizationId, role: invite.role },
      }),
      this.prisma.orgInvite.delete({ where: { token } }),
    ])

    const org = await this.prisma.organization.findUnique({ where: { id: invite.organizationId } })
    if (!org) throw new NotFoundException('Organization not found')
    return org
  }

  /**
   * Lists all members of an organization.
   * @param orgId - Organization ID
   * @param userId - Authenticated user's ID
   * @returns Array of members with user details
   */
  async getMembers(orgId: string, userId: string): Promise<OrgMemberWithUser[]> {
    await this.requireMembership(orgId, userId)
    return this.prisma.orgMember.findMany({
      where: { organizationId: orgId },
      include: { user: { select: { id: true, email: true, displayName: true } } },
      orderBy: { joinedAt: 'asc' },
    })
  }

  /**
   * Updates a member's role (OWNER only; cannot change OWNER role).
   * @param orgId - Organization ID
   * @param targetUserId - User whose role to change
   * @param requesterId - Authenticated user's ID
   * @param dto - New role
   */
  async updateMemberRole(orgId: string, targetUserId: string, requesterId: string, dto: UpdateOrgMemberRoleDto): Promise<OrgMember> {
    await this.requireRole(orgId, requesterId, [OrgRole.OWNER])

    const member = await this.prisma.orgMember.findUnique({
      where: { userId_organizationId: { userId: targetUserId, organizationId: orgId } },
    })
    if (!member) throw new NotFoundException('Member not found')
    if (member.role === OrgRole.OWNER) throw new ForbiddenException('Cannot change the OWNER role')
    if (dto.role === OrgRole.OWNER) throw new ForbiddenException('Cannot assign OWNER role via API')

    return this.prisma.orgMember.update({
      where: { userId_organizationId: { userId: targetUserId, organizationId: orgId } },
      data: { role: dto.role },
    })
  }

  /**
   * Removes a member from the organization (OWNER/ADMIN only; cannot remove OWNER).
   * @param orgId - Organization ID
   * @param targetUserId - User to remove
   * @param requesterId - Authenticated user's ID
   */
  async removeMember(orgId: string, targetUserId: string, requesterId: string): Promise<void> {
    await this.requireRole(orgId, requesterId, [OrgRole.OWNER, OrgRole.ADMIN])

    const member = await this.prisma.orgMember.findUnique({
      where: { userId_organizationId: { userId: targetUserId, organizationId: orgId } },
    })
    if (!member) throw new NotFoundException('Member not found')
    if (member.role === OrgRole.OWNER) throw new ForbiddenException('Cannot remove the organization owner')

    await this.prisma.orgMember.delete({
      where: { userId_organizationId: { userId: targetUserId, organizationId: orgId } },
    })
  }

  /** @private Throws if the user does not have one of the required roles */
  private async requireRole(orgId: string, userId: string, roles: OrgRole[]): Promise<void> {
    const member = await this.prisma.orgMember.findUnique({
      where: { userId_organizationId: { userId, organizationId: orgId } },
    })
    if (!member || !roles.includes(member.role)) {
      throw new ForbiddenException('Insufficient permissions for this organization')
    }
  }

  /** @private Throws if the user is not a member of the organization */
  private async requireMembership(orgId: string, userId: string): Promise<void> {
    const member = await this.prisma.orgMember.findUnique({
      where: { userId_organizationId: { userId, organizationId: orgId } },
    })
    if (!member) throw new NotFoundException('Organization not found')
  }
}
