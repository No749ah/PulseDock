'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Building2, ChevronDown, Plus, Check } from 'lucide-react'
import { api } from '../../lib/api'
import { useRouter } from 'next/navigation'

interface Organization {
  id: string
  name: string
  slug: string
  _count?: { members: number }
}

export function OrgSwitcher() {
  const router = useRouter()
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const loadOrgs = useCallback(async () => {
    try {
      const data = await api<Organization[]>('/v1/organizations')
      setOrgs(data)
    } catch {
      // No orgs or not authenticated — fail silently
    }
  }, [])

  useEffect(() => { loadOrgs() }, [loadOrgs])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleSwitch = async (orgId: string) => {
    try {
      await api(`/v1/organizations/${orgId}/switch`, undefined, { method: 'POST' })
      setActiveOrgId(orgId)
      setOpen(false)
      router.refresh()
    } catch {
      // Ignore
    }
  }

  const activeOrg = orgs.find((o) => o.id === activeOrgId)
  const displayName = activeOrg?.name ?? 'Personal'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-xl hover:bg-bg-surface transition-colors group"
      >
        <div className="w-6 h-6 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0">
          <Building2 className="w-3.5 h-3.5 text-accent" />
        </div>
        <span className="text-sm font-medium text-text-primary flex-1 text-left truncate">{displayName}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-56 bg-bg-card border border-border rounded-2xl shadow-xl z-50 py-1 overflow-hidden">
          {/* Personal option */}
          <button
            onClick={() => { setActiveOrgId(null); setOpen(false) }}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-bg-surface transition-colors"
          >
            <div className="w-6 h-6 rounded-full bg-bg-surface border border-border flex items-center justify-center text-xs font-medium text-text-muted">
              P
            </div>
            <span className="text-text-primary flex-1 text-left">Personal</span>
            {!activeOrgId && <Check className="w-3.5 h-3.5 text-accent" />}
          </button>

          {orgs.length > 0 && (
            <>
              <div className="h-px bg-border mx-3 my-1" />
              {orgs.map((org) => (
                <button
                  key={org.id}
                  onClick={() => handleSwitch(org.id)}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-bg-surface transition-colors"
                >
                  <div className="w-6 h-6 rounded-lg bg-accent/20 flex items-center justify-center text-xs font-medium text-accent flex-shrink-0">
                    {org.name[0].toUpperCase()}
                  </div>
                  <span className="text-text-primary flex-1 text-left truncate">{org.name}</span>
                  {activeOrgId === org.id && <Check className="w-3.5 h-3.5 text-accent flex-shrink-0" />}
                </button>
              ))}
            </>
          )}

          <div className="h-px bg-border mx-3 my-1" />
          <button
            onClick={() => { setOpen(false); router.push('/account/organizations') }}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-text-muted hover:text-text-primary hover:bg-bg-surface transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Create organization
          </button>
        </div>
      )}
    </div>
  )
}
