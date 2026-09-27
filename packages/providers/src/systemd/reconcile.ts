import type { Resource } from "@gatehouse/types";

import { renderServiceUnit } from "./render";
import {
  applyServiceUnit,
  checkSystemdService,
  removeManagedService,
} from "./runtime";
import { validateServiceResource } from "./validate";

export async function reconcileSystemdResource(
  resource: Resource,
): Promise<void> {
  validateServiceResource(resource);

  if (resource.kind !== "service") {
    throw new Error("Systemd provider requires a service resource");
  }

  const unit = renderServiceUnit(resource);

  await applyServiceUnit(
    resource.id,
    unit,
    resource.spec.autoStart !== false,
  );
}

export async function destroySystemdResource(
  resource: Resource,
): Promise<void> {
  validateServiceResource(resource);

  await removeManagedService(resource.id);
}


export async function healthSystemdResource(resource: Resource) {
  validateServiceResource(resource);

  if (resource.kind !== "service") {
    return {
      healthy: false,
      message: "Systemd health check requires a service resource",
    };
  }

  const serviceState = await checkSystemdService(resource.id);

  if (!serviceState.healthy || !resource.spec.healthcheck) {
    return serviceState;
  }

  const port = resource.spec.ports.find(
    (candidate) =>
      candidate.protocol === "http" || candidate.protocol === "https",
  );

  if (!port) {
    return {
      healthy: false,
      message: "Healthcheck configured but service has no HTTP/HTTPS port",
    };
  }

  const path = resource.spec.healthcheck.path.startsWith("/")
    ? resource.spec.healthcheck.path
    : `/${resource.spec.healthcheck.path}`;

  const url = `${port.protocol}://127.0.0.1:${port.port}${path}`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5_000),
    });

    return {
      healthy: response.ok,
      message: response.ok
        ? `Health endpoint returned ${response.status}`
        : `Health endpoint returned ${response.status}`,
    };
  } catch (cause) {
    return {
      healthy: false,
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}
