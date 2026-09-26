import { updateResourceState } from "@gatehouse/db";
import { getProvider } from "@gatehouse/providers";
import {
  getResource,
  listResources,
} from "@gatehouse/resources";

import { providerContextForResource } from "./providerContext";

export async function checkResourceHealth(
  resourceId: string,
): Promise<boolean | null> {
  const resource = getResource(resourceId);

  if (!resource) {
    throw new Error(`Resource "${resourceId}" not found`);
  }

  if (resource.status === "reconciling") {
    return null;
  }

  const checkedAt = new Date().toISOString();

  if (!resource.enabled) {
    updateResourceState(resource.id, {
      runtime: {
        healthy: false,
        lastHealthCheckAt: checkedAt,
        lastHealthMessage: "Resource is disabled",
      },
    });

    return false;
  }

  const provider = getProvider(resource.provider);

  if (!provider?.health) {
    updateResourceState(resource.id, {
      runtime: {
        lastHealthCheckAt: checkedAt,
        lastHealthMessage: `Provider "${resource.provider}" does not implement health checks`,
      },
    });

    return null;
  }

  const context = providerContextForResource(resource.id);
  const result = await provider.health(resource, context);

  updateResourceState(resource.id, {
    runtime: {
      healthy: result.healthy,
      lastHealthCheckAt: checkedAt,
      lastHealthMessage:
        result.message ??
        (result.healthy ? "Resource is healthy" : "Resource is unhealthy"),
    },
  });

  return result.healthy;
}

function healthIntervalSeconds(
  resource: ReturnType<typeof listResources>[number],
): number {
  if (resource.kind === "service" && resource.spec.healthcheck) {
    return Math.max(resource.spec.healthcheck.intervalSeconds, 10);
  }

  return 60;
}

function healthCheckIsDue(
  resource: ReturnType<typeof listResources>[number],
  now: number,
): boolean {
  if (resource.status === "reconciling") {
    return false;
  }

  const last = resource.runtime?.lastHealthCheckAt;

  if (!last) {
    return true;
  }

  const lastTime = Date.parse(last);

  if (!Number.isFinite(lastTime)) {
    return true;
  }

  return now - lastTime >= healthIntervalSeconds(resource) * 1000;
}

export async function checkAllResourceHealth(): Promise<void> {
  const resources = listResources();
  const now = Date.now();

  await Promise.allSettled(
    resources
      .filter((resource) => healthCheckIsDue(resource, now))
      .map((resource) => checkResourceHealth(resource.id)),
  );
}
