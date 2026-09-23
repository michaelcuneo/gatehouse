export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEvent {
  timestamp: number;
  source: string;
  logGroup?: string;
  logStream?: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  traceId?: string;
  fields?: Record<string, unknown>;
}

export interface OperationalIssue {
  fingerprint: string;
  severity: "warning" | "error" | "critical";
  source: string;
  message: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
  latest: LogEvent;
}

export interface LogQuery {
  logGroups: string[];
  startTime: number;
  endTime: number;
  limit?: number;
  query?: string;
}
