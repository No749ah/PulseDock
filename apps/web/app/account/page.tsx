"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { api } from "../../lib/api";
import { getUser } from "../../components/auth";
import { AppFrame } from "../../components/app-frame";
import { useToast } from "../../components/ui/toast";

import { GrafanaIntegrationCard } from "./components/GrafanaIntegrationCard";
import { SystemInfoCard } from "./components/SystemInfoCard";
import { DataRetentionCard } from "./components/DataRetentionCard";
import { BackupRestoreCard } from "./components/BackupRestoreCard";
import { ProfileCard } from "./components/ProfileCard";
import { ChangePasswordCard } from "./components/ChangePasswordCard";
import { TwoFactorCard } from "./components/TwoFactorCard";
import { ApiKeysCard } from "./components/ApiKeysCard";
import { ActivityLogCard } from "./components/ActivityLogCard";
import { SessionsCard } from "./components/SessionsCard";
import { NotificationPrefsCard } from "./components/NotificationPrefsCard";
import { ScheduledReportsCard } from "./components/ScheduledReportsCard";
import { TeamMembersCard } from "./components/TeamMembersCard";

import type {
  Me,
  Session,
  ApiKey,
  AuditLogEntry,
  NotificationPreference,
  ScheduledReport,
  TeamMember,
  PendingInvite,
} from "./components/shared";

export default function AccountPage() {
  const router = useRouter();
  const { success: toastSuccess, error: toastError } = useToast();
  const [user, setUser] = useState<ReturnType<typeof getUser> | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Profile initial values
  const [initialEmail, setInitialEmail] = useState("");
  const [initialDisplayName, setInitialDisplayName] = useState("");
  const [initialTimezone, setInitialTimezone] = useState("UTC");

  // Lazy-loaded data
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreference | null>(null);
  const [scheduledReport, setScheduledReport] = useState<ScheduledReport | null>(null);
  const [reportLoaded, setReportLoaded] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);

  useEffect(() => {
    const currentUser = getUser();
    setUser(currentUser);
    if (!currentUser) {
      router.push("/login");
      return;
    }

    const userId = currentUser.id;

    async function load() {
      try {
        setLoading(true);

        const [profile, sess, keys] = await Promise.all([
          api<Me>("/v1/auth/me", userId),
          api<Session[]>("/v1/auth/sessions", userId),
          api<ApiKey[]>("/v1/api-keys", userId),
        ]);
        setMe(profile);
        setSessions(sess);
        setApiKeys(keys);
        setInitialEmail(profile.email);
        const dn = (profile as unknown as { displayName?: string }).displayName ?? "";
        setInitialDisplayName(dn);
        setInitialTimezone((profile as unknown as { timezone?: string }).timezone ?? "UTC");

        // Lazy loads
        api<AuditLogEntry[]>("/v1/auth/audit-log", userId).then(setAuditLog).catch(() => {});
        api<NotificationPreference>("/v1/notification-preferences", userId).then(setNotifPrefs).catch(() => {});
        api<ScheduledReport | null>("/v1/reports", userId).then((r) => {
          setScheduledReport(r);
          setReportLoaded(true);
        }).catch(() => { setReportLoaded(true); });
        setTeamLoading(true);
        Promise.all([
          api<TeamMember[]>("/v1/team/members", userId),
          api<PendingInvite[]>("/v1/team/invites", userId),
        ]).then(([members, invites]) => {
          setTeamMembers(members);
          setPendingInvites(invites);
        }).catch(() => {}).finally(() => setTeamLoading(false));
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Failed to load account");
        router.push("/login");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [router]);

  if (!user) return null;
  if (loading)
    return (
      <AppFrame title="Account" breadcrumbs={[{ label: "Account" }]}>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-accent border-t-transparent" />
        </div>
      </AppFrame>
    );

  return (
    <AppFrame title="Account" subtitle="Manage your profile and security" breadcrumbs={[{ label: "Account" }]}>
      <div className="space-y-6">
        {loadError && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-danger/10 border border-danger/20">
            <AlertCircle className="w-5 h-5 text-danger mt-0.5 shrink-0" />
            <span className="text-danger text-sm">{loadError}</span>
          </div>
        )}

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="space-y-6">
            <ProfileCard
              me={me!}
              userId={user.id}
              initialEmail={initialEmail}
              initialDisplayName={initialDisplayName}
              initialTimezone={initialTimezone}
              onEmailChange={(email) => { if (me) setMe({ ...me, email }); }}
              toastSuccess={toastSuccess}
              toastError={toastError}
            />

            <ChangePasswordCard
              userId={user.id}
              toastSuccess={toastSuccess}
              toastError={toastError}
            />

            <TwoFactorCard
              me={me!}
              userId={user.id}
              onMeUpdate={setMe}
              toastSuccess={toastSuccess}
              toastError={toastError}
            />

            <ApiKeysCard
              apiKeys={apiKeys}
              userId={user.id}
              onApiKeysChange={setApiKeys}
              toastSuccess={toastSuccess}
              toastError={toastError}
            />

            <GrafanaIntegrationCard />
          </div>

          <div className="space-y-6">
            <ActivityLogCard
              auditLog={auditLog}
              userId={user.id}
              toastSuccess={toastSuccess}
              toastError={toastError}
            />

            <SessionsCard
              sessions={sessions}
              userId={user.id}
              onSessionsChange={setSessions}
              toastSuccess={toastSuccess}
              toastError={toastError}
            />

            <NotificationPrefsCard
              notifPrefs={notifPrefs}
              userId={user.id}
              onPrefsChange={setNotifPrefs}
              toastError={toastError}
            />

            <ScheduledReportsCard
              scheduledReport={scheduledReport}
              reportLoaded={reportLoaded}
              userId={user.id}
              toastSuccess={toastSuccess}
              toastError={toastError}
            />

            <TeamMembersCard
              teamMembers={teamMembers}
              pendingInvites={pendingInvites}
              teamLoading={teamLoading}
              userId={user.id}
              onTeamMembersChange={setTeamMembers}
              onPendingInvitesChange={setPendingInvites}
              toastSuccess={toastSuccess}
              toastError={toastError}
            />

            <SystemInfoCard userId={user?.id} />
            <DataRetentionCard onSave={() => toastSuccess("Data retention settings saved")} />
            <BackupRestoreCard />
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
