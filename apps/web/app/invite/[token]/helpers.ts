export const ROLE_COLORS: Record<string, string> = {
  OWNER: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  ADMIN: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  EDITOR: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  VIEWER: "text-slate-400 bg-slate-400/10 border-slate-400/20",
};

export const ROLE_DESC: Record<string, string> = {
  OWNER: "Full control of the workspace",
  ADMIN: "Manage monitors, alerts, and team members",
  EDITOR: "Create and edit monitors and status pages",
  VIEWER: "Read-only access to monitors and dashboards",
};
