import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../common/prisma.service'
import { InviteMemberDto, TeamRole, UpdateMemberRoleDto } from './team.dto'
import { TeamMember, TeamInvite, User } from '@prisma/client'

type MemberWithUser = TeamMember & {
  user: Pick<User, 'id' | 'email' | 'displayName'>
}

@Injectable()
export class TeamService {
  constructor(private readonly prisma: PrismaService) {}

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
}
