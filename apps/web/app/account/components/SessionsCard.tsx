"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { api } from "../../../lib/api";
import { Card } from "../../components/Card";
import { type Session } from "./shared";

interface SessionsCardProps {
  sessions: Session[];
  userId: string;
  onSessionsChange: (sessions: Session[]) => void;
  toastSuccess: (msg: string) => void;
  toastError: (msg: string) => void;
}

export function SessionsCard({ sessions, userId, onSessionsChange, toastSuccess, toastError }: SessionsCardProps) {
  const [sessionsExpanded, setSessionsExpanded] = useState(false);

  const handleRevokeSession = async (sessionId: string) => {
    if (!window.confirm("Revoke this session?")) return;
    try {
      await api("/v1/auth/sessions/revoke", userId, {
        method: "POST",
        body: JSON.stringify({ sessionId }),
      });
      onSessionsChange(sessions.filter((s) => s.id !== sessionId));
      toastSuccess("Session revoked");
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Failed to revoke session");
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-surface-elevated">
            <LogOut className="w-5 h-5 text-text-secondary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text-primary">Active Sessions</h2>
            {sessions.filter((s) => !s.revokedAt).length > 0 && (
              <p className="text-xs text-text-secondary mt-0.5">{sessions.filter((s) => !s.revokedAt).length} active</p>
            )}
          </div>
        </div>
        {sessions.filter((s) => !s.revokedAt).length > 1 && (
          <button
            onClick={async () => {
              const others = sessions.filter((s) => !s.revokedAt).slice(1);
              for (const s of others) await handleRevokeSession(s.id);
            }}
            className="text-xs text-danger hover:text-danger/80 transition-colors"
          >
            Revoke others
          </button>
        )}
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-text-secondary text-sm">No active sessions found</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {(sessionsExpanded ? sessions : sessions.slice(0, 5)).map((session, i) => (
              <div
                key={session.id}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-surface-elevated/50 border border-border"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${!session.revokedAt ? 'bg-success' : 'bg-danger'}`} />
                  <div className="min-w-0">
                    <p className="text-xs text-text-primary truncate">
                      {i === 0 ? <span className="text-accent font-medium">Current — </span> : ''}
                      {session.userAgent ? session.userAgent.replace(/\s*\(.*?\)/g, '').trim() || 'Unknown device' : 'Unknown device'}
                    </p>
                    <p className="text-[11px] text-text-secondary mt-0.5">
                      {session.ipAddress ? `${session.ipAddress} · ` : ''}
                      {new Date(session.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                {!session.revokedAt && i !== 0 && (
                  <button
                    onClick={() => handleRevokeSession(session.id)}
                    className="ml-2 p-1.5 rounded-lg text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors shrink-0"
                    title="Revoke session"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {sessions.length > 5 && (
            <button
              onClick={() => setSessionsExpanded((v) => !v)}
              className="mt-3 text-xs text-accent hover:text-accent/80 transition-colors"
            >
              {sessionsExpanded ? 'Show less' : `Show all ${sessions.length} sessions`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}
