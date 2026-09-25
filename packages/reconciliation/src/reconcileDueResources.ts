import {
  getLatestSuccessfulDeployment,
  updateResourceState,
  writeAuditLog,
} from "@gatehouse/db";
import { listResources } from "@gatehouse/resources";
import type { Resource } from "@gatehouse/types";

import { fingerprintStaticSiteBuild } from "./artifactFingerprint";
import { planReconciliation } from "./planReconciliation";
import { reconcilePlannedResource } from "./reconcileResource";

export interface ReconciliationSweepOptions {
  now?: number;
  errorRetryMs?: number;
  unhealthyRetryMs?: number;
  deployOnChangeMs?: number;
  staleReconcileMs?: number;
}

export interface ReconciliationSweepFailure {
  resourceId: string;
  resourceName: string;
  message: string;
}

export interface ReconciliationSweepResult {
  due: number;
  reconciled: number;
  deferred: number;
  failed: ReconciliationSweepFailure[];
}

const DEFAULT_ERROR_RETRY_MS = 60_000;
const DEFAULT_UNHEALTHY_RETRY_MS = 30_000;
const DEFAULT_DEPLOY_ON_CHANGE_MS = 15_000;
const DEFAULT_STALE_RECONCILE_MS = 5 * 60_000;

function parsedTime(value: string | undefined): number | null {
  if (!value) return null;

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function lastAttemptAt(resource: Resource): number | null {
  return (
    parsedTime(resource.runtime?.lastReconciledAt) ??
    parsedTime(resource.updatedAt)
  );
}

function elapsedAtLeast(
  resource: Resource,
  now: number,
  interval: number,
): boolean {
  const last = lastAttemptAt(resource);

  return last === null || now - last >= interval;
}

function reconciliationIsStale(
  resource: Resource,
  now: number,
  interval: number,
): boolean {
  const updatedAt = parsedTime(resource.updatedAt);

  return updatedAt === null || now - updatedAt >= interval;
}

function resourceIsDue(
  resource: Resource,
  now: number,
  options: Required<
    Pick<
      ReconciliationSweepOptions,
      | "errorRetryMs"
      | "unhealthyRetryMs"
      | "deployOnChangeMs"
      | "staleReconcileMs"
    >
  >,
): boolean {
  if (resource.status === "reconciling") {
    return reconciliationIsStale(
      resource,
      now,
      options.staleReconcileMs,
    );
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

async function artifactChangeIsDue(
  resource: Resource,
): Promise<boolean> {
  if (
    resource.kind !== "static_site" ||
    resource.spec.deployOnChange !== true
  ) {
    return true;
  }

  const fingerprint = await fingerprintStaticSiteBuild(resource);
  const previous = getLatestSuccessfulDeployment(resource.id);

  return previous?.artifactFingerprint !== fingerprint;
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

function dependenciesReady(
  plan: Resource[],
  rootId: string,
  dueIds: Set<string>,
  processed: Map<string, "succeeded" | "failed">,
): boolean {
  for (const dependency of plan) {
    if (dependency.id === rootId) break;

    if (processed.get(dependency.id) === "failed") {
      return false;
    }

    if (dueIds.has(dependency.id)) {
      if (processed.get(dependency.id) !== "succeeded") {
        return false;
      }

      continue;
    }

    if (dependency.status !== "ready") {
      return false;
    }
  }

  return true;
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
    staleReconcileMs: Math.max(
      options.staleReconcileMs ?? DEFAULT_STALE_RECONCILE_MS,
      5_000,
    ),
  };

  const resources = listResources();
  const failedDuringDiscovery: ReconciliationSweepFailure[] = [];
  const due: Resource[] = [];

  for (const resource of resources) {
    if (!resourceIsDue(resource, now, timing)) {
      continue;
    }

    const isRoutineArtifactCheck =
      resource.status === "ready" &&
      resource.runtime?.healthy !== false &&
      resource.kind === "static_site" &&
      resource.spec.deployOnChange === true;

    if (isRoutineArtifactCheck) {
      try {
        if (!(await artifactChangeIsDue(resource))) {
          continue;
        }
      } catch (cause) {
        failedDuringDiscovery.push(planningFailure(resource, cause));
        continue;
      }
    }

    due.push(resource);
  }
  const dueIds = new Set(due.map((resource) => resource.id));
  const processed = new Map<string, "succeeded" | "failed">();
  const failed: ReconciliationSweepFailure[] = [
    ...failedDuringDiscovery,
  ];
  let reconciled = 0;
  let deferred = 0;

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

      if (
        resource.id === root.id &&
        !dependenciesReady(plan, root.id, dueIds, processed)
      ) {
        deferred += 1;
        break;
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
    deferred,
    failed,
  };
}
