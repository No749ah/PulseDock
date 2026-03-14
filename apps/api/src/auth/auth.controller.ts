import { Body, Controller, Get, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { AuthGuard } from '../common/auth.guard';
import { Throttle } from '@nestjs/throttler';
import { AcceptInviteDto, ChangePasswordDto, DisableTotpDto, InviteInfoDto, LoginDto, RefreshDto, RegisterDto, RequestResetDto, ResendVerificationDto, ResetPasswordDto, RevokeSessionDto, UpdateProfileDto, VerifyCodeDto, VerifyEmailDto, VerifyTotpDto } from './auth.dto';
import { generateCsrfToken, setCsrfCookie } from '../common/csrf.middleware';

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

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully.' })
  @ApiResponse({ status: 409, description: 'Email already in use.' })
  register(@Body() body: RegisterDto) {
    return this.authService.register(body.email, body.password);
  }

  @Throttle({ default: { limit: 8, ttl: 60_000 } })
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

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('verify-email')
  @ApiOperation({ summary: 'Verify email address' })
  @ApiResponse({ status: 200, description: 'Email verified.' })
  @ApiResponse({ status: 401, description: 'Token invalid or expired.' })
  verifyEmail(@Body() body: VerifyEmailDto) {
    return this.authService.verifyEmail(body.token);
  }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('resend-verification')
  @ApiOperation({ summary: 'Resend email verification link' })
  @ApiResponse({ status: 200, description: 'Verification email sent (or no-op if already verified).' })
  resendVerification(@Body() body: ResendVerificationDto) {
    return this.authService.resendVerification(body.email);
  }

  @Throttle({ default: { limit: 4, ttl: 60_000 } })
  @Get('mail-configured')
  @ApiOperation({ summary: 'Check if mail/SMTP is configured on this instance' })
  @ApiResponse({ status: 200, description: 'Returns { enabled: boolean }' })
  mailConfigured() {
    return { enabled: this.authService.isMailConfigured() };
  }

  @Post('request-password-reset')
  @ApiOperation({ summary: 'Request password reset email' })
  @ApiResponse({ status: 200, description: 'Reset email sent (or silently no-ops if email unknown).' })
  @ApiResponse({ status: 503, description: 'Mail not configured on this instance.' })
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
  @ApiOperation({ summary: 'Logout', description: 'Clears auth cookies and revokes the current DB session.' })
  @ApiResponse({ status: 200, description: 'Logged out.' })
  async logout(
    @Req() req: { cookies?: Record<string, string | undefined> },
    @Res({ passthrough: true }) res: ExpressResponse,
  ) {
    // Revoke the current session in the DB so stolen refresh tokens become invalid
    const token = req.cookies?.pulsedock_token;
    if (token) {
      await this.authService.revokeSessionByToken(token).catch(() => {/* ignore errors */});
    }
    clearAuthCookies(res);
    return { ok: true };
  }

  @Get('csrf')
  @ApiOperation({ summary: 'Obtain CSRF token', description: 'Sets the pulsedock_csrf non-httpOnly cookie and returns the token. Call this once after page load; include the token as X-CSRF-Token on all state-mutating requests.' })
  @ApiResponse({ status: 200, description: 'CSRF token returned.' })
  getCsrf(@Res({ passthrough: true }) res: { cookie: (name: string, value: string, opts: object) => void }) {
    const token = generateCsrfToken();
    setCsrfCookie(res as Parameters<typeof setCsrfCookie>[0], token);
    return { csrfToken: token };
  }

  // ─── 2FA / TOTP ─────────────────────────────────────────────────────────────

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('2fa/verify')
  @ApiOperation({ summary: 'Complete 2FA login', description: 'Verify TOTP code (or recovery code) after initial password auth. Returns full auth tokens.' })
  @ApiResponse({ status: 200, description: 'Login completed.' })
  @ApiResponse({ status: 401, description: 'Invalid code or expired temp token.' })
  async verifyTotpLogin(
    @Req() req: { headers: Record<string, string | undefined>; ip?: string },
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() body: VerifyTotpDto,
  ) {
    const result = await this.authService.verifyTotpLogin(body.tempToken, body.code, {
      userAgent: req.headers['user-agent'] ?? null,
      ipAddress: req.ip ?? null,
    });
    setAuthCookies(res, result.accessToken, result.refreshToken);
    return result;
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Post('2fa/setup')
  @ApiOperation({ summary: 'Begin 2FA setup', description: 'Generates a TOTP secret and QR code. Call enable after verifying a code.' })
  @ApiResponse({ status: 200, description: 'Setup data returned.' })
  setup2FA(@Req() req: { user: { id: string } }) {
    return this.authService.setup2FA(req.user.id);
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Post('2fa/enable')
  @ApiOperation({ summary: 'Enable 2FA', description: 'Verifies first TOTP code and enables 2FA. Returns one-time recovery codes.' })
  @ApiResponse({ status: 200, description: '2FA enabled, recovery codes returned.' })
  @ApiResponse({ status: 401, description: 'Invalid TOTP code.' })
  enable2FA(@Req() req: { user: { id: string } }, @Body() body: VerifyCodeDto) {
    return this.authService.verifyAndEnable2FA(req.user.id, body.code);
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Post('2fa/disable')
  @ApiOperation({ summary: 'Disable 2FA', description: 'Disables 2FA after verifying password and current TOTP code.' })
  @ApiResponse({ status: 200, description: '2FA disabled.' })
  @ApiResponse({ status: 401, description: 'Invalid password or TOTP code.' })
  disable2FA(@Req() req: { user: { id: string } }, @Body() body: DisableTotpDto) {
    return this.authService.disable2FA(req.user.id, body.password, body.code);
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Post('2fa/regenerate-recovery-codes')
  @ApiOperation({ summary: 'Regenerate recovery codes', description: 'Generates 10 new single-use recovery codes. Old codes are invalidated.' })
  @ApiResponse({ status: 200, description: 'New recovery codes returned.' })
  @ApiResponse({ status: 401, description: 'Invalid TOTP code.' })
  regenerateRecoveryCodes(@Req() req: { user: { id: string } }, @Body() body: VerifyCodeDto) {
    return this.authService.regenerateRecoveryCodes(req.user.id, body.code);
  }

  // ────────────────────────────────────────────────────────────────────────────

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
    return this.authService.updateProfile(req.user.id, body.email, body.displayName, body.timezone);
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

  // ─── Audit Log ──────────────────────────────────────────────────────────────

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Get('audit-log')
  @ApiOperation({ summary: 'Get activity log', description: 'Returns the last 100 audit log entries for the authenticated user.' })
  @ApiResponse({ status: 200, description: 'Audit log entries returned.' })
  getAuditLog(@Req() req: { user: { id: string } }, @Query('limit') limit?: string) {
    return this.authService.getUserAuditLog(req.user.id, limit ? parseInt(limit, 10) : 100);
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @Get('audit-log/export')
  @ApiOperation({ summary: 'Export activity log', description: 'Download audit log as CSV or JSON. Pass ?format=csv or ?format=json.' })
  @ApiResponse({ status: 200, description: 'File download.' })
  async exportAuditLog(
    @Req() req: { user: { id: string } },
    @Query('format') format: string,
    @Res() res: { setHeader(k: string, v: string): void; end(data: string): void },
  ) {
    const fmt = format === 'csv' ? 'csv' : 'json';
    const { data, contentType, filename } = await this.authService.exportUserAuditLog(req.user.id, fmt);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.end(data);
  }
}
