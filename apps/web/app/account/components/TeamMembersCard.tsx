"use client";

import { useState } from "react";
import { Trash2, UserPlus, Users, X } from "lucide-react";
import { api } from "../../../lib/api";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import {
  inputClass,
  type TeamMember,
  type PendingInvite,
  type TeamRoleApi,
  type TeamRoleDisplay,
} from "./shared";

interface TeamMembersCardProps {
  teamMembers: TeamMember[];
  pendingInvites: PendingInvite[];
  teamLoading: boolean;
  userId: string;
  onTeamMembersChange: (members: TeamMember[]) => void;
  onPendingInvitesChange: (invites: PendingInvite[]) => void;
  toastSuccess: (msg: string) => void;
  toastError: (msg: string) => void;
}

const roleColors: Record<TeamRoleApi, string> = {
  OWNER: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  ADMIN: "bg-danger/15 text-danger border-danger/20",
  EDITOR: "bg-accent/15 text-accent border-accent/20",
  VIEWER: "bg-blue-500/15 text-blue-400 border-blue-500/20",
};

const roleLabel: Record<TeamRoleApi, string> = { OWNER: "Owner", ADMIN: "Admin", EDITOR: "Editor", VIEWER: "Viewer" };

export function TeamMembersCard({
  teamMembers,
  pendingInvites,
  teamLoading,
  userId,
  onTeamMembersChange,
  onPendingInvitesChange,
  toastSuccess,
  toastError,
}: TeamMembersCardProps) {
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRoleDisplay>("Viewer");
  const [inviteSending, setInviteSending] = useState(false);

  const handleSendInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviteSending(true);
    try {
      const roleMap: Record<TeamRoleDisplay, TeamRoleApi> = { Admin: "ADMIN", Editor: "EDITOR", Viewer: "VIEWER" };
      const result = await api<{ type: "member" | "invite"; data: TeamMember | PendingInvite }>(
        "/v1/team/invite",
        userId,
        { method: "POST", body: JSON.stringify({ email: inviteEmail.trim(), role: roleMap[inviteRole] }) },
      );
      if (result.type === "member") {
        onTeamMembersChange([...teamMembers, result.data as TeamMember]);
        toastSuccess(`${inviteEmail.trim()} added as team member`);
      } else {
        onPendingInvitesChange([...pendingInvites, result.data as PendingInvite]);
        toastSuccess(`Invitation sent to ${inviteEmail.trim()}`);
      }
      setInviteEmail("");
      setInviteRole("Viewer");
      setShowInviteModal(false);
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Failed to send invite");
    } finally {
      setInviteSending(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!window.confirm("Remove this team member?")) return;
    try {
      await api("/v1/team/members/" + memberId, userId, { method: "DELETE" });
      onTeamMembersChange(teamMembers.filter((m) => m.id !== memberId));
      toastSuccess("Team member removed");
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Failed to remove member");
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    try {
      await api("/v1/team/invites/" + inviteId, userId, { method: "DELETE" });
      onPendingInvitesChange(pendingInvites.filter((i) => i.id !== inviteId));
      toastSuccess("Invite cancelled");
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Failed to cancel invite");
    }
  };

  return (
    <>
      <Card>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-accent/10">
              <Users className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-text-primary">Team Members</h2>
              <p className="text-xs text-text-secondary mt-0.5">Manage who has access to your workspace</p>
            </div>
          </div>
          <Button size="sm" onClick={() => setShowInviteModal(true)}>
            <UserPlus className="w-4 h-4 mr-1.5" />
            Invite Member
          </Button>
        </div>

        {teamLoading ? (
          <div className="text-center py-8">
            <span className="animate-spin rounded-full h-6 w-6 border-2 border-accent border-t-transparent inline-block" />
          </div>
        ) : teamMembers.length === 0 && pendingInvites.length === 0 ? (
          <div className="text-center py-8">
            <Users className="w-8 h-8 text-text-secondary/40 mx-auto mb-3" />
            <p className="text-text-secondary text-sm">No team members yet</p>
            <p className="text-text-secondary/60 text-xs mt-1">Invite colleagues to collaborate on your workspace</p>
          </div>
        ) : (
          <div className="space-y-2">
            {teamMembers.map((member) => {
              const initials = (member.user.displayName ?? member.user.email).slice(0, 2).toUpperCase();
              return (
                <div key={member.id} className="flex items-center gap-3 p-3 rounded-lg bg-surface-elevated/50 border border-border">
                  <div className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                    <span className="text-sm font-semibold text-accent">{initials}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{member.user.displayName ?? member.user.email}</p>
                    <p className="text-xs text-text-secondary truncate">{member.user.email}</p>
                  </div>
                  <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded border ${roleColors[member.role]}`}>
                    {roleLabel[member.role]}
                  </span>
                  {member.role !== "OWNER" && (
                    <Button variant="ghost" size="sm" onClick={() => handleRemoveMember(member.id)} className="text-danger hover:text-danger shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {pendingInvites.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Pending Invites</p>
            <div className="space-y-2">
              {pendingInvites.map((invite) => (
                <div key={invite.id} className="flex items-center gap-3 p-3 rounded-lg bg-surface-elevated/30 border border-border border-dashed">
                  <div className="w-9 h-9 rounded-full bg-text-secondary/10 flex items-center justify-center shrink-0">
                    <span className="text-sm font-semibold text-text-secondary">?</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{invite.email}</p>
                    <p className="text-xs text-text-secondary/60 truncate">Expires {new Date(invite.expiresAt).toLocaleDateString()}</p>
                  </div>
                  <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded border ${roleColors[invite.role]}`}>
                    {roleLabel[invite.role]}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => handleCancelInvite(invite.id)} className="text-text-secondary hover:text-danger shrink-0">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Invite Team Member Modal */}
      <Modal
        isOpen={showInviteModal}
        onClose={() => { setShowInviteModal(false); setInviteEmail(""); setInviteRole("Viewer" as TeamRoleDisplay); }}
        title="Invite Team Member"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Email Address</label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className={inputClass}
              placeholder="colleague@company.com"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Role</label>
            <div className="grid grid-cols-3 gap-2">
              {(["Admin", "Editor", "Viewer"] as TeamRoleDisplay[]).map((role) => {
                const desc = role === "Admin" ? "Full access" : role === "Editor" ? "Create & edit" : "Read-only";
                const active = inviteRole === role;
                const colors = role === "Admin" ? "border-danger bg-danger/10 text-danger" : role === "Editor" ? "border-accent bg-accent/10 text-accent" : "border-blue-500 bg-blue-500/10 text-blue-400";
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setInviteRole(role)}
                    className={`flex flex-col items-start gap-1 px-3 py-2.5 rounded-lg border text-left transition-colors ${active ? colors : "border-border bg-surface-elevated/30 text-text-secondary hover:border-accent/50"}`}
                  >
                    <span className="font-medium text-sm">{role}</span>
                    <span className="text-[10px] opacity-70">{desc}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowInviteModal(false)} className="flex-1">Cancel</Button>
            <Button onClick={handleSendInvite} disabled={!inviteEmail.trim() || inviteSending} className="flex-1">
              {inviteSending ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  Sending…
                </span>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 mr-1.5" />
                  Send Invite
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
