"use client"
import { useEffect } from 'react'

export default function RuntimeApiProvider() {
  useEffect(() => {
    try {
      // If running in browser, expose NEXT_PUBLIC_API_BASE_URL to runtime from the current origin
      // so client code using process.env.NEXT_PUBLIC_API_BASE_URL will pick it up if undefined.
      const current = window.location.origin
      // prefer existing env if set, otherwise set to origin + /api
      if (!window.__NEXT_PUBLIC_API_BASE_URL_OVERRIDE__) {
        // eslint-disable-next-line no-undef
        ;(window as any).__NEXT_PUBLIC_API_BASE_URL_OVERRIDE__ = `${current}/api`
      }
    } catch (e) {
      // ignore
    }
    return () => {}
  }, [])
  return null
}
