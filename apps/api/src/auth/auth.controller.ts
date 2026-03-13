import { Body, Controller, Get, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { AuthGuard } from '../common/auth.guard';
import { Throttle } from '@nestjs/throttler';
import { AcceptInviteDto, ChangePasswordDto, InviteInfoDto, LoginDto, RefreshDto, RegisterDto, RequestResetDto, ResetPasswordDto, RevokeSessionDto, UpdateProfileDto } from './auth.dto';

interface ExpressResponse {
  cookie(name: string, value: string, options: object): this;
  clearCookie(name: string, options?: object): this;
}

const IS_PROD = process.env.NODE_ENV === 'production';
const ACCESS_TTL = 15 * 60 * 1000;        // 15 min
const REFRESH_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

function setAuthCookies(res: ExpressResponse, accessToken: string, refreshToken: string) {
  res.cookie('pulsedock_token', accessToken, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    maxAge: ACCESS_TTL,
    path: '/',
  });
  res.cookie('pulsedock_refresh', refreshToken, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    maxAge: REFRESH_TTL,
    path: '/',
  });
}

function clearAuthCookies(res: ExpressResponse) {
  res.clearCookie('pulsedock_token', { path: '/' });
  res.clearCookie('pulsedock_refresh', { path: '/' });
}

@ApiTags('Auth')
@Controller('v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully.' })
  @ApiResponse({ status: 409, description: 'Email already in use.' })
  register(@Body() body: RegisterDto) {
    return this.authService.register(body.email, body.password);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @ApiOperation({ summary: 'Login with email + password', description: 'Returns accessToken, refreshToken and user info.' })
  @ApiResponse({ status: 200, description: 'Login successful.' })
  @ApiResponse({ status: 401, description: 'Invalid credentials or account locked.' })
  async login(
    @Req() req: { headers: Record<string, string | undefined>; ip?: string },
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() body: LoginDto,
  ) {
    const result = await this.authService.login(body.email, body.password, {
      userAgent: req.headers['user-agent'] ?? null,
      ipAddress: req.ip ?? null,
    });
    setAuthCookies(res, result.accessToken, result.refreshToken);
    return result;
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token', description: 'Exchange a valid refreshToken for a new access + refresh token pair.' })
  @ApiResponse({ status: 200, description: 'Token refreshed.' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token.' })
  async refresh(
    @Req() req: { headers: Record<string, string | undefined>; ip?: string; cookies?: Record<string, string | undefined> },
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() body: RefreshDto,
  ) {
    // Accept refresh token from cookie OR from request body (backward compat)
    const refreshToken = req.cookies?.pulsedock_refresh || body.refreshToken;
    const result = await this.authService.refresh(refreshToken, {
      userAgent: req.headers['user-agent'] ?? null,
      ipAddress: req.ip ?? null,
    });
    setAuthCookies(res, result.accessToken, result.refreshToken);
    return result;
  }

  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @Post('invite-info')
  @ApiOperation({ summary: 'Get invite details', description: 'Look up metadata for an invite token (inviter email, expiry).' })
  @ApiResponse({ status: 200, description: 'Invite info returned.' })
  @ApiResponse({ status: 404, description: 'Invite token not found or expired.' })
  inviteInfo(@Body() body: InviteInfoDto) {
    return this.authService.getInviteInfo(body.token);
  }

  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('accept-invite')
  @ApiOperation({ summary: 'Accept an invite and create account', description: 'Validates the invite token and creates the invited user with the given password.' })
  @ApiResponse({ status: 201, description: 'Account created.' })
  @ApiResponse({ status: 400, description: 'Token invalid or expired.' })
  async acceptInvite(
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() body: AcceptInviteDto,
  ) {
    const result = await this.authService.acceptInvite(body.token, body.password);
    if ('accessToken' in result && 'refreshToken' in result) {
      setAuthCookies(res, result.accessToken as string, result.refreshToken as string);
    }
    return result;
  }

  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post('request-password-reset')
  @ApiOperation({ summary: 'Request password reset email' })
  @ApiResponse({ status: 200, description: 'Reset email sent (or silently no-ops if email unknown).' })
  requestPasswordReset(@Body() body: RequestResetDto) {
    return this.authService.requestPasswordReset(body.email);
  }

  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password using token' })
  @ApiResponse({ status: 200, description: 'Password updated.' })
  @ApiResponse({ status: 400, description: 'Token invalid or expired.' })
  async resetPassword(
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() body: ResetPasswordDto,
  ) {
    const result = await this.authService.resetPassword(body.token, body.newPassword);
    if (result && typeof result === 'object' && 'accessToken' in result && 'refreshToken' in result) {
      setAuthCookies(res, result.accessToken as string, result.refreshToken as string);
    }
    return result;
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('logout')
  @ApiOperation({ summary: 'Logout', description: 'Clears auth cookies and optionally revokes the current session.' })
  @ApiResponse({ status: 200, description: 'Logged out.' })
  logout(@Res({ passthrough: true }) res: ExpressResponse) {
    clearAuthCookies(res);
    return { ok: true };
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Get current user', description: 'Returns the authenticated user profile.' })
  @ApiResponse({ status: 200, description: 'User returned.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  me(@Req() req: { user?: { id: string; email: string; role: string } }) {
    return req.user ?? null;
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Patch('profile')
  @ApiOperation({ summary: 'Update user profile', description: 'Update email and/or display name.' })
  @ApiResponse({ status: 200, description: 'Profile updated.' })
  updateProfile(@Req() req: { user: { id: string } }, @Body() body: UpdateProfileDto) {
    return this.authService.updateProfile(req.user.id, body.email);
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Post('change-password')
  @ApiOperation({ summary: 'Change password', description: "Change the authenticated user's password. Requires current password." })
  @ApiResponse({ status: 200, description: 'Password changed.' })
  @ApiResponse({ status: 401, description: 'Current password incorrect.' })
  changePassword(@Req() req: { user: { id: string } }, @Body() body: ChangePasswordDto) {
    return this.authService.changePassword(req.user.id, body.currentPassword, body.newPassword);
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Get('sessions')
  @ApiOperation({ summary: 'List active sessions', description: 'Returns all active refresh token sessions for the current user.' })
  @ApiResponse({ status: 200, description: 'Sessions returned.' })
  sessions(@Req() req: { user: { id: string } }) {
    return this.authService.listSessions(req.user.id);
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Post('sessions/revoke')
  @ApiOperation({ summary: 'Revoke a session', description: 'Invalidate a specific refresh token session by ID.' })
  @ApiResponse({ status: 200, description: 'Session revoked.' })
  revokeSession(@Req() req: { user: { id: string } }, @Body() body: RevokeSessionDto) {
    return this.authService.revokeSession(req.user.id, body.sessionId);
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Post('sessions/revoke-all')
  @ApiOperation({ summary: 'Revoke all sessions', description: 'Invalidate all active refresh token sessions for the current user (force logout everywhere).' })
  @ApiResponse({ status: 200, description: 'All sessions revoked.' })
  revokeAllSessions(@Req() req: { user: { id: string } }) {
    return this.authService.revokeAllSessions(req.user.id);
  }
}
