import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyScope } from '../apikeys/apikeys.dto';
import { ApiKeysService } from '../apikeys/apikeys.service';
import { REQUIRE_SCOPE_KEY } from './require-scope.decorator';

interface RequestUser {
  id: string;
  email: string;
  role: string;
  apiKeyScope?: ApiKeyScope;
}

interface ScopedRequest {
  user?: RequestUser;
  method: string;
}

/** HTTP methods allowed per scope level */
const SCOPE_ALLOWED_METHODS: Record<ApiKeyScope, Set<string>> = {
  [ApiKeyScope.READ]: new Set(['GET', 'HEAD', 'OPTIONS']),
  [ApiKeyScope.WRITE]: new Set(['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH']),
  [ApiKeyScope.ADMIN]: new Set(['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE']),
};

/**
 * ScopeGuard enforces API key scope requirements.
 *
 * - If no @RequireScope decorator is present the guard is a no-op.
 * - If the request is not API-key authenticated (no apiKeyScope on user) the
 *   guard is a no-op (session-authenticated users bypass scope checks).
 * - If the key's scope is insufficient: throws ForbiddenException.
 *
 * Two axes of enforcement:
 *   1. Decorator-declared minimum scope (@RequireScope)
 *   2. HTTP method vs. scope (READ → GET only, WRITE → GET+mutations, ADMIN → all)
 */
@Injectable()
export class ScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ScopedRequest>();
    const user = request.user;

    // Not API-key authenticated — skip scope enforcement
    if (!user?.apiKeyScope) return true;

    const keyScope = user.apiKeyScope;
    const method = request.method.toUpperCase();

    // --- 1. HTTP method check (always applies to API-key requests) ---
    const allowedMethods = SCOPE_ALLOWED_METHODS[keyScope];
    if (!allowedMethods.has(method)) {
      throw new ForbiddenException('API key scope insufficient');
    }

    // --- 2. Decorator-declared minimum scope check ---
    const required = this.reflector.getAllAndOverride<ApiKeyScope | undefined>(REQUIRE_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (required && !ApiKeysService.scopeAllows(keyScope, required)) {
      throw new ForbiddenException('API key scope insufficient');
    }

    return true;
  }
}

/** Pure helper — exported for unit testing without NestJS DI */
export function checkScopeAllows(keyScope: ApiKeyScope, method: string, required?: ApiKeyScope): boolean {
  const allowedMethods = SCOPE_ALLOWED_METHODS[keyScope];
  if (!allowedMethods.has(method.toUpperCase())) return false;
  if (required && !ApiKeysService.scopeAllows(keyScope, required)) return false;
  return true;
}
