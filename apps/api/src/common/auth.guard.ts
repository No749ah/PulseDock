import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string>; user?: unknown }>();
    const auth = request.headers.authorization ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : undefined;
    const tokenUser = await this.authService.getUserByAccessToken(token);
    if (!tokenUser) throw new UnauthorizedException('Unauthorized');

    const user = await this.authService.getActiveUserById(tokenUser.id);
    if (!user) throw new UnauthorizedException('User inactive or not found');

    request.user = { id: user.id, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword };
    return true;
  }
}
