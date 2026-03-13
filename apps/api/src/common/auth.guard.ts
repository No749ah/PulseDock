import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';

interface AuthRequest {
  headers: Record<string, string | undefined>;
  cookies?: Record<string, string | undefined>;
  user?: unknown;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();

    // Prefer httpOnly cookie, fall back to Authorization header (backward compat)
    const cookieToken = request.cookies?.pulsedock_token;
    const authHeader = request.headers.authorization ?? '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const token = cookieToken || bearerToken;

    const tokenUser = await this.authService.getUserByAccessToken(token);
    if (!tokenUser) throw new UnauthorizedException('Unauthorized');

    const user = await this.authService.getActiveUserById(tokenUser.id);
    if (!user) throw new UnauthorizedException('User inactive or not found');

    request.user = { id: user.id, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword };
    return true;
  }
}
