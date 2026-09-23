import type { LogEvent, LogLevel, OperationalIssue } from "../types";

const ERROR_PATTERN =
  /\b(error|exception|fatal|panic|failed|failure|unhandled|timeout|timed out|accessdenied|throttl(?:e|ed|ing))\b/i;

const WARN_PATTERN =
  /\b(warn(?:ing)?|retry|degraded|overdue|slow|rate limit)\b/i;

function structuredMessage(message: string) {
  try {
    const parsed = JSON.parse(message) as Record<string, unknown>;

    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function classifyLogLevel(message: string): LogLevel {
  const structured = structuredMessage(message);
  const rawLevel = String(
    structured?.level ??
      structured?.severity ??
      structured?.logLevel ??
      "",
  ).toLowerCase();

  if (["fatal", "critical", "error"].includes(rawLevel)) return "error";
  if (["warn", "warning"].includes(rawLevel)) return "warn";
  if (["debug", "trace"].includes(rawLevel)) return "debug";

  if (ERROR_PATTERN.test(message)) return "error";
  if (WARN_PATTERN.test(message)) return "warn";

  return "info";
}

function normalizeFingerprintText(message: string) {
  return message
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "<uuid>")
    .replace(/\b\d{4,}\b/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 320);
}

function fingerprint(event: LogEvent) {
  return [event.source, event.level, normalizeFingerprintText(event.message)].join(
    "::",
  );
}

export function groupOperationalIssues(
  events: LogEvent[],
): OperationalIssue[] {
  const issues = new Map<string, OperationalIssue>();

  for (const event of events) {
    if (event.level !== "error" && event.level !== "warn") continue;

    const key = fingerprint(event);
    const existing = issues.get(key);

    if (existing) {
      existing.count += 1;
      existing.firstSeen = Math.min(existing.firstSeen, event.timestamp);
      existing.lastSeen = Math.max(existing.lastSeen, event.timestamp);

      if (event.timestamp >= existing.latest.timestamp) {
        existing.latest = event;
        existing.message = event.message;
      }

      continue;
    }

    issues.set(key, {
      fingerprint: key,
      severity: event.level === "error" ? "error" : "warning",
      source: event.source,
      message: event.message,
      count: 1,
      firstSeen: event.timestamp,
      lastSeen: event.timestamp,
      latest: event,
    });
  }

  return [...issues.values()].sort(
    (a, b) => b.lastSeen - a.lastSeen || b.count - a.count,
  );
}
