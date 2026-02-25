import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from '../common/auth.guard';
import { Throttle } from '@nestjs/throttler';
import { AcceptInviteDto, ChangePasswordDto, InviteInfoDto, LoginDto, RefreshDto, RegisterDto, RequestResetDto, ResetPasswordDto, RevokeSessionDto, UpdateProfileDto } from './auth.dto';

@Controller('v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.authService.register(body.email, body.password);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  login(@Req() req: { headers: Record<string, string | undefined>; ip?: string }, @Body() body: LoginDto) {
    return this.authService.login(body.email, body.password, {
      userAgent: req.headers['user-agent'] ?? null,
      ipAddress: req.ip ?? null,
    });
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  refresh(@Req() req: { headers: Record<string, string | undefined>; ip?: string }, @Body() body: RefreshDto) {
    return this.authService.refresh(body.refreshToken, {
      userAgent: req.headers['user-agent'] ?? null,
      ipAddress: req.ip ?? null,
    });
  }

  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @Post('invite-info')
  inviteInfo(@Body() body: InviteInfoDto) {
    return this.authService.getInviteInfo(body.token);
  }

  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('accept-invite')
  acceptInvite(@Body() body: AcceptInviteDto) {
    return this.authService.acceptInvite(body.token, body.password);
  }

  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post('request-password-reset')
  requestPasswordReset(@Body() body: RequestResetDto) {
    return this.authService.requestPasswordReset(body.email);
  }

  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('reset-password')
  resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body.token, body.newPassword);
  }

  @UseGuards(AuthGuard)
  @Get('me')
  me(@Req() req: { user?: { id: string; email: string; role: string } }) {
    return req.user ?? null;
  }

  @UseGuards(AuthGuard)
  @Patch('profile')
  updateProfile(@Req() req: { user: { id: string } }, @Body() body: UpdateProfileDto) {
    return this.authService.updateProfile(req.user.id, body.email);
  }

  @UseGuards(AuthGuard)
  @Post('change-password')
  changePassword(@Req() req: { user: { id: string } }, @Body() body: ChangePasswordDto) {
    return this.authService.changePassword(req.user.id, body.currentPassword, body.newPassword);
  }

  @UseGuards(AuthGuard)
  @Get('sessions')
  sessions(@Req() req: { user: { id: string } }) {
    return this.authService.listSessions(req.user.id);
  }

  @UseGuards(AuthGuard)
  @Post('sessions/revoke')
  revokeSession(@Req() req: { user: { id: string } }, @Body() body: RevokeSessionDto) {
    return this.authService.revokeSession(req.user.id, body.sessionId);
  }

  @UseGuards(AuthGuard)
  @Post('sessions/revoke-all')
  revokeAllSessions(@Req() req: { user: { id: string } }) {
    return this.authService.revokeAllSessions(req.user.id);
  }
}
