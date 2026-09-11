export type MonitorType = 'HTTP' | 'GIT_RELEASE' | 'DOCKER_IMAGE';

export interface ExtensionSettings {
  apiUrl: string;
  apiKey: string;
}

export interface CreateMonitorPayload {
  name: string;
  target: string;
  type: MonitorType;
  intervalSec: number;
  timeoutMs: number;
}

export interface MonitorResponse {
  id: string;
  name: string;
  target: string;
  type: MonitorType;
  enabled: boolean;
  intervalSec: number;
  createdAt: string;
}

export interface ApiError {
  message: string | string[];
  statusCode?: number;
}
