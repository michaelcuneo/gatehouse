import { updateResourceState } from "@gatehouse/db";
import { getProvider } from "@gatehouse/providers";
import {
  getResource,
  listResources,
} from "@gatehouse/resources";

export async function checkResourceHealth(
  resourceId: string,
): Promise<boolean | null> {
  const resource = getResource(resourceId);

  if (!resource) {
    throw new Error(`Resource "${resourceId}" not found`);
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

  const result = await provider.health(resource);

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

export async function checkAllResourceHealth(): Promise<void> {
  const resources = listResources();

  await Promise.allSettled(
    resources.map((resource) => checkResourceHealth(resource.id)),
  );
}
