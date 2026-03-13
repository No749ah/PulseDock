import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { ApiKeysService } from '../apikeys/apikeys.service';

interface AuthRequest {
  headers: Record<string, string | undefined>;
  cookies?: Record<string, string | undefined>;
  user?: unknown;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly apiKeysService: ApiKeysService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();

    // Prefer httpOnly cookie, fall back to Authorization header (backward compat)
    const cookieToken = request.cookies?.pulsedock_token;
    const authHeader = request.headers.authorization ?? '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const token = cookieToken || bearerToken;

    // Check if this looks like an API key (pdck_ prefix)
    if (token?.startsWith('pdck_')) {
      const apiKeyUser = await this.apiKeysService.validateKey(token);
      if (!apiKeyUser) throw new UnauthorizedException('Invalid or expired API key');
      request.user = { id: apiKeyUser.id, email: apiKeyUser.email, role: apiKeyUser.role, mustChangePassword: false };
      return true;
    }

    const tokenUser = await this.authService.getUserByAccessToken(token);
    if (!tokenUser) throw new UnauthorizedException('Unauthorized');

    const user = await this.authService.getActiveUserById(tokenUser.id);
    if (!user) throw new UnauthorizedException('User inactive or not found');

    request.user = { id: user.id, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword };
    return true;
  }
}
