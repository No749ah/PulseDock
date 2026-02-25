"use client"
import { useEffect } from 'react'

export default function RuntimeApiProvider() {
  useEffect(() => {
    try {
      const current = window.location.origin
      // prefer existing env if set, otherwise set to origin + /api
      if (!(window as any).__NEXT_PUBLIC_API_BASE_URL_OVERRIDE__) {
        (window as any).__NEXT_PUBLIC_API_BASE_URL_OVERRIDE__ = `${current}/api`
      }
    } catch (e) {
      // ignore
    }
    return () => {}
  }, [])
  return null
}
