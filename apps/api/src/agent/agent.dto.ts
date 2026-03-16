export interface AgentReportBody {
  toolId: string;
  version: string;
  monitorId?: string;
  hostname?: string;
}

export interface AgentReportResponse {
  ok: true;
  monitorId: string;
  version: string;
}

export interface AgentStatusItem {
  monitorId: string;
  monitorName: string;
  toolId: string;
  version: string;
  hostname: string | null;
  reportedAt: string;
}

export interface AgentStatusResponse {
  reports: AgentStatusItem[];
}
