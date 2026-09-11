import { SetMetadata } from '@nestjs/common';
import { ApiKeyScope } from '../apikeys/apikeys.dto';

export const REQUIRE_SCOPE_KEY = 'requireScope';

/**
 * Attach a minimum required API key scope to a route handler.
 * Enforced by ScopeGuard when the request is authenticated via API key.
 *
 * Usage:
 *   @RequireScope(ApiKeyScope.READ)   // GET-only operations
 *   @RequireScope(ApiKeyScope.WRITE)  // mutations
 *   @RequireScope(ApiKeyScope.ADMIN)  // admin-only
 */
export const RequireScope = (scope: ApiKeyScope) => SetMetadata(REQUIRE_SCOPE_KEY, scope);
