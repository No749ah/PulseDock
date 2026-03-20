'use client'

import { useEffect, useState, useCallback } from 'react'
import { Building2, Plus, Users, Trash2, UserMinus, Crown, Shield, Eye, Mail } from 'lucide-react'
import { api } from '../../../lib/api'
import { useToast } from '../../../components/ui/toast'

type OrgRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'

interface Organization {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  website: string | null
  plan: string
  createdAt: string
  _count?: { members: number }
}

interface OrgMember {
  id: string
  userId: string
  organizationId: string
  role: OrgRole
  joinedAt: string
  user: { id: string; email: string; displayName: string | null }
}

const ROLE_ICONS: Record<OrgRole, React.ReactNode> = {
  OWNER: <Crown className="w-3.5 h-3.5 text-yellow-400" />,
  ADMIN: <Shield className="w-3.5 h-3.5 text-blue-400" />,
  MEMBER: <Users className="w-3.5 h-3.5 text-text-muted" />,
  VIEWER: <Eye className="w-3.5 h-3.5 text-text-muted" />,
}

const ROLE_COLORS: Record<OrgRole, string> = {
  OWNER: 'text-yellow-400',
  ADMIN: 'text-blue-400',
  MEMBER: 'text-text-muted',
  VIEWER: 'text-text-muted',
}

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [members, setMembers] = useState<OrgMember[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', slug: '' })
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'MEMBER' as OrgRole })
  const { success: toastSuccess, error: toastError } = useToast()

  const loadOrgs = useCallback(async () => {
    try {
      const data = await api<Organization[]>('/v1/organizations')
      setOrgs(data)
      if (data.length > 0 && !selected) setSelected(data[0].id)
    } catch {
      toastError('Failed to load organizations')
    } finally {
      setLoading(false)
    }
  }, [selected])

  const loadMembers = useCallback(async (orgId: string) => {
    try {
      const data = await api<OrgMember[]>(`/v1/organizations/${orgId}/members`)
      setMembers(data)
    } catch {
      toastError('Failed to load members')
    }
  }, [])

  useEffect(() => { loadOrgs() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (selected) loadMembers(selected) }, [selected, loadMembers])

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createForm.name.trim() || !createForm.slug.trim()) return
    try {
      await api('/v1/organizations', undefined, {
        method: 'POST',
        body: JSON.stringify(createForm),
      })
      toastSuccess('Organization created')
      setCreateForm({ name: '', slug: '' })
      setCreating(false)
      loadOrgs()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create'
      toastError(msg)
    }
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected || !inviteForm.email.trim()) return
    try {
      await api(`/v1/organizations/${selected}/members/invite`, undefined, {
        method: 'POST',
        body: JSON.stringify(inviteForm),
      })
      toastSuccess('Member invited')
      setInviteForm({ email: '', role: 'MEMBER' })
      setInviting(false)
      loadMembers(selected)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to invite'
      toastError(msg)
    }
  }

  const handleRemoveMember = async (orgId: string, userId: string) => {
    if (!confirm('Remove this member?')) return
    try {
      await api(`/v1/organizations/${orgId}/members/${userId}`, undefined, { method: 'DELETE' })
      toastSuccess('Member removed')
      loadMembers(orgId)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to remove'
      toastError(msg)
    }
  }

  const handleDeleteOrg = async (orgId: string) => {
    if (!confirm('Delete this organization? This cannot be undone.')) return
    try {
      await api(`/v1/organizations/${orgId}`, undefined, { method: 'DELETE' })
      toastSuccess('Organization deleted')
      setSelected(null)
      loadOrgs()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete'
      toastError(msg)
    }
  }

  const currentOrg = orgs.find((o) => o.id === selected)
  const myMembership = members.find((m) => m.userId === selected)
  const _ = myMembership // suppress lint

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-20 rounded-2xl bg-bg-card animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Organizations</h1>
          <p className="text-sm text-text-muted mt-0.5">Manage your workspaces and team members</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-accent text-white rounded-xl hover:bg-accent/90 active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" />
          New Organization
        </button>
      </div>

      {/* Create org modal */}
      {creating && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-bg-card border border-border rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-text-primary mb-4">Create Organization</h2>
            <form onSubmit={handleCreateOrg} className="space-y-4">
              <div>
                <label className="block text-sm text-text-muted mb-1">Name</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => {
                    const name = e.target.value
                    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
                    setCreateForm({ name, slug })
                  }}
                  placeholder="Acme Corp"
                  className="w-full px-3 py-2 bg-bg-surface border border-border rounded-xl text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-text-muted mb-1">Slug</label>
                <input
                  type="text"
                  value={createForm.slug}
                  onChange={(e) => setCreateForm((f) => ({ ...f, slug: e.target.value }))}
                  placeholder="acme-corp"
                  pattern="[a-z0-9-]+"
                  className="w-full px-3 py-2 bg-bg-surface border border-border rounded-xl text-text-primary text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent/50"
                  required
                />
                <p className="text-xs text-text-muted mt-1">Used in URLs. Lowercase letters, digits, and hyphens only.</p>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-accent text-white rounded-xl hover:bg-accent/90 active:scale-95 transition-all"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Org list */}
        <div className="space-y-2">
          {orgs.length === 0 && (
            <div className="text-center py-10 text-text-muted">
              <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No organizations yet</p>
            </div>
          )}
          {orgs.map((org) => (
            <button
              key={org.id}
              onClick={() => setSelected(org.id)}
              className={`w-full text-left p-4 rounded-2xl border transition-all ${
                selected === org.id
                  ? 'border-accent bg-accent/10'
                  : 'border-border bg-bg-card hover:border-border-hover'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-bg-surface flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-5 h-5 text-text-muted" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{org.name}</p>
                  <p className="text-xs text-text-muted">/{org.slug} · {org._count?.members ?? 0} members</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Org detail */}
        {currentOrg && (
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold text-text-primary">{currentOrg.name}</h2>
                  <p className="text-xs text-text-muted">/{currentOrg.slug} · {currentOrg.plan} plan</p>
                </div>
                <button
                  onClick={() => handleDeleteOrg(currentOrg.id)}
                  className="p-2 text-text-muted hover:text-danger rounded-xl hover:bg-danger/10 transition-all"
                  title="Delete organization"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Members */}
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-text-primary">Members ({members.length})</h3>
                <button
                  onClick={() => setInviting(true)}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 bg-bg-surface border border-border rounded-lg hover:border-accent/50 transition-all text-text-muted"
                >
                  <Mail className="w-3.5 h-3.5" />
                  Invite
                </button>
              </div>

              <div className="space-y-2">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 bg-bg-surface rounded-xl border border-border"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-bg-card flex items-center justify-center text-xs font-medium text-text-muted border border-border">
                        {(member.user.displayName ?? member.user.email)[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm text-text-primary">{member.user.displayName ?? member.user.email}</p>
                        {member.user.displayName && (
                          <p className="text-xs text-text-muted">{member.user.email}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`flex items-center gap-1 text-xs font-medium ${ROLE_COLORS[member.role]}`}>
                        {ROLE_ICONS[member.role]}
                        {member.role}
                      </span>
                      {member.role !== 'OWNER' && (
                        <button
                          onClick={() => handleRemoveMember(currentOrg.id, member.userId)}
                          className="p-1.5 text-text-muted hover:text-danger rounded-lg hover:bg-danger/10 transition-all"
                          title="Remove member"
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Invite modal */}
      {inviting && selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-bg-card border border-border rounded-2xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-semibold text-text-primary mb-4">Invite Member</h2>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-sm text-text-muted mb-1">Email</label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="jane@example.com"
                  className="w-full px-3 py-2 bg-bg-surface border border-border rounded-xl text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-text-muted mb-1">Role</label>
                <select
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm((f) => ({ ...f, role: e.target.value as OrgRole }))}
                  className="w-full px-3 py-2 bg-bg-surface border border-border rounded-xl text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                >
                  <option value="ADMIN">Admin</option>
                  <option value="MEMBER">Member</option>
                  <option value="VIEWER">Viewer</option>
                </select>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setInviting(false)}
                  className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-accent text-white rounded-xl hover:bg-accent/90 active:scale-95 transition-all"
                >
                  Invite
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
