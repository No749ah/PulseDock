import type { MonitorItem, MonitorFormData, MonitorFormDataExtended } from "./types";
import type { MonitorTemplate } from "../components/MonitorTemplates";

export function buildEditFormData(monitor: MonitorItem): MonitorFormDataExtended {
  return {
    name: monitor.name,
    description: monitor.description ?? "",
    type: monitor.type as MonitorFormData["type"],
    target: monitor.target,
    intervalSec: monitor.intervalSec,
    confirmations: monitor.confirmations ?? 1,
    enabled: monitor.enabled,
    pluginId: String(monitor.config?.pluginId ?? ""),
    expectedText: String(monitor.config?.expectedText ?? ""),
    heartbeatTimeoutMin: Number(monitor.config?.timeoutMin ?? 5),
    heartbeatToken: String(monitor.config?.token ?? ""),
    folderId: monitor.folderId ?? "",
    slaTarget: monitor.slaTarget ?? "",
    slaPeriodDays: monitor.slaPeriodDays ?? 30,
    expectedStatus: monitor.config?.expectedStatus ? Number(monitor.config.expectedStatus) : undefined,
    bodyContains: String(monitor.config?.bodyContains ?? ""),
    httpMethod: String(monitor.config?.httpMethod ?? "GET"),
    requestHeaders: monitor.config?.requestHeaders
      ? Object.entries(monitor.config.requestHeaders as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join("\n")
      : "",
    requestBody: String(monitor.config?.requestBody ?? ""),
    responseTimeThresholdMs: monitor.config?.responseTimeThresholdMs ? Number(monitor.config.responseTimeThresholdMs) : undefined,
    bodyJsonPath: String(monitor.config?.bodyJsonPath ?? ""),
    bodyJsonPathExpected: String(monitor.config?.bodyJsonPathExpected ?? ""),
    ehlo: String(monitor.config?.ehlo ?? "pulsedock.monitor"),
    checkTls: Boolean(monitor.config?.checkTls),
    dnsRecordType: String(monitor.config?.recordType ?? "A"),
    dnsExpectedValue: String(monitor.config?.expectedValue ?? ""),
    dnsTimeoutMs: Number(monitor.config?.timeoutMs ?? 10000),
    pingCount: Number(monitor.config?.pingCount ?? 3),
    pingMaxLossPct: monitor.config?.maxPacketLossPct !== undefined ? Number(monitor.config.maxPacketLossPct) : undefined,
    browserExpectedText: String(monitor.config?.browserExpectedText ?? ""),
    browserSelector: String(monitor.config?.browserSelector ?? ""),
    browserStatusCodesRaw: Array.isArray(monitor.config?.browserStatusCodes)
      ? (monitor.config.browserStatusCodes as number[]).join(", ")
      : "",
  };
}

export function buildFormDataFromTemplate(t: MonitorTemplate): MonitorFormDataExtended {
  const safeType = (["HTTP", "TCP", "SSL_CERT", "HEARTBEAT", "DNS", "PING", "SMTP", "BROWSER"] as string[]).includes(t.type)
    ? (t.type as MonitorFormData["type"])
    : "HTTP";
  const cfg = (t.config ?? {}) as Record<string, unknown>;
  return {
    name: t.name,
    type: safeType,
    target: t.target,
    intervalSec: t.intervalSec,
    description: "",
    confirmations: 1,
    enabled: true,
    pluginId: t.pluginId ?? "",
    expectedText: t.expectedText ?? "",
    heartbeatTimeoutMin: 5,
    heartbeatToken: "",
    folderId: "",
    slaTarget: "",
    slaPeriodDays: 30,
    ...(cfg.checkTls !== undefined ? { checkTls: Boolean(cfg.checkTls) } : {}),
    ...(typeof cfg.ehlo === "string" ? { ehlo: cfg.ehlo } : {}),
    ...(typeof cfg.recordType === "string" ? { dnsRecordType: cfg.recordType } : {}),
    ...(typeof cfg.expectedValue === "string" ? { dnsExpectedValue: cfg.expectedValue } : {}),
    ...(typeof cfg.timeoutMs === "number" ? { dnsTimeoutMs: cfg.timeoutMs } : {}),
    ...(typeof cfg.pingCount === "number" ? { pingCount: cfg.pingCount } : {}),
    ...(typeof cfg.maxPacketLossPct === "number" ? { pingMaxLossPct: cfg.maxPacketLossPct } : {}),
    ...(typeof cfg.browserExpectedText === "string" ? { browserExpectedText: cfg.browserExpectedText } : {}),
    ...(typeof cfg.browserSelector === "string" ? { browserSelector: cfg.browserSelector } : {}),
    ...(Array.isArray(cfg.browserStatusCodes) ? { browserStatusCodesRaw: (cfg.browserStatusCodes as number[]).join(", ") } : {}),
  };
}
