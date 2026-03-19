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
