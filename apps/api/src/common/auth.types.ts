/**
 * Shared authentication types used across all controllers.
 * Single source of truth — eliminates duplicate interface definitions.
 */

/** JWT payload attached to req.user by AuthGuard */
export interface JwtUser {
  id: string;
  sub?: string;
  email?: string;
  role?: string;
}

/** Express Request with authenticated user payload */
export interface AuthenticatedRequest {
  user: JwtUser;
}
