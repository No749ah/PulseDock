/**
 * Shared types for the v2 API surface.
 * Eliminates duplication across v2 controllers.
 */

// Re-export from canonical location
export { AuthenticatedRequest } from '../common/auth.types';

/** Standard envelope for paginated v2 list responses */
export interface PaginatedEnvelope<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

/** Helper to build paginated envelope from query params */
export function parsePagination(
  query: { page?: number; limit?: number },
  maxLimit = 100,
  defaultLimit = 20,
): { page: number; limit: number; skip: number } {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(maxLimit, Math.max(1, query.limit ?? defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

/** Build envelope meta from total + pagination */
export function buildMeta(
  total: number,
  page: number,
  limit: number,
): PaginatedEnvelope<never>['meta'] {
  return { total, page, limit, pages: Math.ceil(total / limit) };
}
