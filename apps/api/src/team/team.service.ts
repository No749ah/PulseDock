import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../common/prisma.service'
import { MailerService } from '../common/mailer.service'
import { InviteMemberDto, TeamRole, UpdateMemberRoleDto } from './team.dto'
import { TeamMember, TeamInvite, User } from '@prisma/client'

type MemberWithUser = TeamMember & {
  user: Pick<User, 'id' | 'email' | 'displayName'>
}

@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  /**
   * Returns all active team members for the workspace owned by `userId`.
   * Ordered by join date ascending (earliest member first).
   */
  async getMembers(userId: string): Promise<MemberWithUser[]> {
    return this.prisma.teamMember.findMany({
      where: { ownerId: userId },
      include: {
        user: {
          select: { id: true, email: true, displayName: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    })
  }

  /**
   * Returns all pending (not yet accepted, not expired) invites sent by `userId`.
   * Ordered by created-at descending (newest first).
   */
  async getInvites(userId: string): Promise<TeamInvite[]> {
    return this.prisma.teamInvite.findMany({
      where: {
        ownerId: userId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  /**
   * Invite a user to the workspace.
   * - If the email belongs to an existing user: creates a `TeamMember` record immediately.
   * - If the email is unknown: creates a `TeamInvite` with a 7-day token and fires a
   *   fire-and-forget invite email via `MailerService`.
   *
   * @param userId - Workspace owner's user ID
   * @param dto    - Invite payload (email + role)
   * @throws BadRequestException if OWNER role is requested, self-invite, or already a member
   */
  async inviteMember(
    userId: string,
    dto: InviteMemberDto,
  ): Promise<{ type: 'member' | 'invite'; data: MemberWithUser | TeamInvite }> {
    if (dto.role === TeamRole.OWNER) {
      throw new BadRequestException('Cannot assign OWNER role')
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    })

    if (existingUser) {
      if (existingUser.id === userId) {
        throw new BadRequestException('Cannot invite yourself')
      }

      const alreadyMember = await this.prisma.teamMember.findUnique({
        where: { ownerId_userId: { ownerId: userId, userId: existingUser.id } },
      })
      if (alreadyMember) {
        throw new BadRequestException('User is already a team member')
      }

      const member = await this.prisma.teamMember.create({
        data: {
          ownerId: userId,
          userId: existingUser.id,
          role: dto.role,
        },
        include: {
          user: {
            select: { id: true, email: true, displayName: true },
          },
        },
      })
      return { type: 'member', data: member }
    }

    const sevenDaysFromNow = new Date()
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)

    const invite = await this.prisma.teamInvite.create({
      data: {
        ownerId: userId,
        email: dto.email,
        role: dto.role,
        expiresAt: sevenDaysFromNow,
      },
    })

    // Fire-and-forget invite email
    const appUrl = process.env.APP_URL ?? 'http://localhost:3001'
    void this.mailer.sendInviteEmail(dto.email, `${appUrl}/invite/${invite.token}`)

    return { type: 'invite', data: invite }
  }

  /**
   * Change the role of a team member.
   * Cannot promote anyone to OWNER or change the role of an existing OWNER.
   *
   * @param userId   - Workspace owner's user ID
   * @param memberId - Target TeamMember record ID
   * @param dto      - New role payload
   * @throws NotFoundException if the member does not exist or belongs to another workspace
   * @throws BadRequestException if attempting to assign or change the OWNER role
   */
  async updateMemberRole(
    userId: string,
    memberId: string,
    dto: UpdateMemberRoleDto,
  ): Promise<MemberWithUser> {
    if (dto.role === TeamRole.OWNER) {
      throw new BadRequestException('Cannot assign OWNER role')
    }

    const member = await this.prisma.teamMember.findFirst({
      where: { id: memberId, ownerId: userId },
    })
    if (!member) {
      throw new NotFoundException('Team member not found')
    }
    if (member.role === TeamRole.OWNER) {
      throw new BadRequestException('Cannot change the role of an OWNER')
    }

    return this.prisma.teamMember.update({
      where: { id: memberId },
      data: { role: dto.role },
      include: {
        user: {
          select: { id: true, email: true, displayName: true },
        },
      },
    })
  }

  /**
   * Remove a team member from the workspace.
   * Owners cannot be removed via this method.
   *
   * @param userId   - Workspace owner's user ID
   * @param memberId - Target TeamMember record ID
   * @throws NotFoundException if the member does not belong to this workspace
   * @throws BadRequestException if attempting to remove an OWNER
   */
  async removeMember(userId: string, memberId: string): Promise<{ message: string }> {
    const member = await this.prisma.teamMember.findFirst({
      where: { id: memberId, ownerId: userId },
    })
    if (!member) {
      throw new NotFoundException('Team member not found')
    }
    if (member.role === TeamRole.OWNER) {
      throw new BadRequestException('Cannot remove an OWNER')
    }

    await this.prisma.teamMember.delete({ where: { id: memberId } })
    return { message: 'Member removed' }
  }

  /**
   * Cancel a pending invite sent by `userId`.
   *
   * @param userId   - Workspace owner's user ID
   * @param inviteId - Target TeamInvite record ID
   * @throws NotFoundException if the invite does not exist or belongs to another workspace
   */
  async cancelInvite(userId: string, inviteId: string): Promise<{ message: string }> {
    const invite = await this.prisma.teamInvite.findFirst({
      where: { id: inviteId, ownerId: userId },
    })
    if (!invite) {
      throw new NotFoundException('Invite not found')
    }

    await this.prisma.teamInvite.delete({ where: { id: inviteId } })
    return { message: 'Invite cancelled' }
  }

  /**
   * Look up an invite by its one-time token for the accept-invite flow.
   * Returns the invite details and the owner's public profile.
   *
   * @param token - UUID token from the invite URL
   * @throws NotFoundException if no invite matches the token
   * @throws BadRequestException if the invite is expired or already accepted
   */
  async getInviteByToken(
    token: string,
  ): Promise<{
    invite: TeamInvite
    owner: Pick<User, 'email' | 'displayName'>
  }> {
    const invite = await this.prisma.teamInvite.findUnique({
      where: { token },
      include: {
        owner: {
          select: { email: true, displayName: true },
        },
      },
    })
    if (!invite) {
      throw new NotFoundException('Invite not found or already used')
    }
    if (invite.expiresAt < new Date()) {
      throw new BadRequestException('This invitation has expired')
    }
    if (invite.acceptedAt) {
      throw new BadRequestException('This invitation has already been accepted')
    }
    const { owner, ...inviteData } = invite as TeamInvite & { owner: Pick<User, 'email' | 'displayName'> }
    return { invite: inviteData, owner }
  }

  /**
   * Accept a pending invite on behalf of an authenticated user.
   * Validates: token exists, not expired, not already accepted, email matches
   * the logged-in user's email, and the user is not already a member.
   * Creates the `TeamMember` record and marks the invite as accepted in a single
   * DB transaction.
   *
   * @param token  - UUID token from the invite URL
   * @param userId - Authenticated user's ID
   * @throws NotFoundException if the invite or user does not exist
   * @throws BadRequestException if the invite is expired, accepted, email mismatch, self-accept, or already a member
   */
  async acceptInvite(
    token: string,
    userId: string,
  ): Promise<MemberWithUser> {
    const invite = await this.prisma.teamInvite.findUnique({
      where: { token },
    })
    if (!invite) {
      throw new NotFoundException('Invite not found or already used')
    }
    if (invite.expiresAt < new Date()) {
      throw new BadRequestException('This invitation has expired')
    }
    if (invite.acceptedAt) {
      throw new BadRequestException('This invitation has already been accepted')
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      throw new NotFoundException('User not found')
    }
    // Check email matches (invite is for a specific email address)
    if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
      throw new BadRequestException('This invitation was sent to a different email address')
    }
    if (invite.ownerId === userId) {
      throw new BadRequestException('Cannot accept your own invitation')
    }

    const alreadyMember = await this.prisma.teamMember.findUnique({
      where: { ownerId_userId: { ownerId: invite.ownerId, userId } },
    })
    if (alreadyMember) {
      throw new BadRequestException('You are already a member of this workspace')
    }

    // Create membership and mark invite accepted in a transaction
    const [member] = await this.prisma.$transaction([
      this.prisma.teamMember.create({
        data: {
          ownerId: invite.ownerId,
          userId,
          role: invite.role,
        },
        include: {
          user: { select: { id: true, email: true, displayName: true } },
        },
      }),
      this.prisma.teamInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      }),
    ])

    return member as MemberWithUser
  }
}
