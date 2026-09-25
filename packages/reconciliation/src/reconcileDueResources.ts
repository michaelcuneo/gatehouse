import {
  updateResourceState,
  writeAuditLog,
} from "@gatehouse/db";
import { listResources } from "@gatehouse/resources";
import type { Resource } from "@gatehouse/types";

import { planReconciliation } from "./planReconciliation";
import { reconcilePlannedResource } from "./reconcileResource";

export interface ReconciliationSweepOptions {
  now?: number;
  errorRetryMs?: number;
  unhealthyRetryMs?: number;
  deployOnChangeMs?: number;
}

export interface ReconciliationSweepFailure {
  resourceId: string;
  resourceName: string;
  message: string;
}

export interface ReconciliationSweepResult {
  due: number;
  reconciled: number;
  failed: ReconciliationSweepFailure[];
}

const DEFAULT_ERROR_RETRY_MS = 60_000;
const DEFAULT_UNHEALTHY_RETRY_MS = 30_000;
const DEFAULT_DEPLOY_ON_CHANGE_MS = 15_000;

function lastAttemptAt(resource: Resource): number | null {
  const value =
    resource.runtime?.lastReconciledAt ??
    resource.updatedAt;

  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function elapsedAtLeast(
  resource: Resource,
  now: number,
  interval: number,
): boolean {
  const last = lastAttemptAt(resource);

  return last === null || now - last >= interval;
}

function resourceIsDue(
  resource: Resource,
  now: number,
  options: Required<
    Pick<
      ReconciliationSweepOptions,
      "errorRetryMs" | "unhealthyRetryMs" | "deployOnChangeMs"
    >
  >,
): boolean {
  if (resource.status === "reconciling") {
    return false;
  }

  if (resource.status === "pending") {
    return true;
  }

  if (
    resource.status === "error" &&
    elapsedAtLeast(resource, now, options.errorRetryMs)
  ) {
    return true;
  }

  if (
    resource.enabled &&
    resource.runtime?.healthy === false &&
    elapsedAtLeast(resource, now, options.unhealthyRetryMs)
  ) {
    return true;
  }

  return (
    resource.enabled &&
    resource.status === "ready" &&
    resource.kind === "static_site" &&
    resource.spec.deployOnChange === true &&
    elapsedAtLeast(resource, now, options.deployOnChangeMs)
  );
}

function planningFailure(
  resource: Resource,
  cause: unknown,
): ReconciliationSweepFailure {
  const message = cause instanceof Error ? cause.message : String(cause);
  const failedAt = new Date().toISOString();

  updateResourceState(resource.id, {
    status: "error",
    runtime: {
      healthy: false,
      lastError: message,
      lastReconciledAt: failedAt,
      lastStatusMessage: "Automatic reconciliation planning failed",
    },
    updatedAt: failedAt,
  });

  writeAuditLog({
    resourceId: resource.id,
    action: "reconcile",
    success: false,
    message,
  });

  return {
    resourceId: resource.id,
    resourceName: resource.name,
    message,
  };
}

export async function reconcileDueResources(
  options: ReconciliationSweepOptions = {},
): Promise<ReconciliationSweepResult> {
  const now = options.now ?? Date.now();
  const timing = {
    errorRetryMs: Math.max(
      options.errorRetryMs ?? DEFAULT_ERROR_RETRY_MS,
      1_000,
    ),
    unhealthyRetryMs: Math.max(
      options.unhealthyRetryMs ?? DEFAULT_UNHEALTHY_RETRY_MS,
      1_000,
    ),
    deployOnChangeMs: Math.max(
      options.deployOnChangeMs ?? DEFAULT_DEPLOY_ON_CHANGE_MS,
      1_000,
    ),
  };

  const resources = listResources();
  const due = resources.filter((resource) =>
    resourceIsDue(resource, now, timing),
  );
  const dueIds = new Set(due.map((resource) => resource.id));
  const processed = new Map<string, "succeeded" | "failed">();
  const failed: ReconciliationSweepFailure[] = [];
  let reconciled = 0;

  for (const root of due) {
    if (processed.get(root.id) === "succeeded") {
      continue;
    }

    let plan: Resource[];

    try {
      plan = planReconciliation(resources, [root.id]);
    } catch (cause) {
      if (!processed.has(root.id)) {
        failed.push(planningFailure(root, cause));
        processed.set(root.id, "failed");
      }

      continue;
    }

    for (const resource of plan) {
      if (!dueIds.has(resource.id)) {
        continue;
      }

      const existing = processed.get(resource.id);

      if (existing === "failed") {
        break;
      }

      if (existing === "succeeded") {
        continue;
      }

      try {
        await reconcilePlannedResource(resource);
        processed.set(resource.id, "succeeded");
        reconciled += 1;
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : String(cause);

        failed.push({
          resourceId: resource.id,
          resourceName: resource.name,
          message,
        });
        processed.set(resource.id, "failed");
        break;
      }
    }
  }

  return {
    due: due.length,
    reconciled,
    failed,
  };
}
