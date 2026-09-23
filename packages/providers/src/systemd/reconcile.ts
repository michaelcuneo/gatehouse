import type { Resource } from "@gatehouse/types";

import { renderServiceUnit } from "./render";
import {
  applyServiceUnit,
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

  await applyServiceUnit(resource.id, unit);
}

export async function destroySystemdResource(
  resource: Resource,
): Promise<void> {
  validateServiceResource(resource);

  await removeManagedService(resource.id);
}
