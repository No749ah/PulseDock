export function getApiBase() {
  if (typeof window !== 'undefined') {
    // prefer runtime override set by RuntimeApiProvider
    // @ts-ignore
    const override = (window as any).__NEXT_PUBLIC_API_BASE_URL_OVERRIDE__
    if (override) return override
    return `${window.location.origin}/api`
  }
  // server-side fallback
  return process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4321'
}
