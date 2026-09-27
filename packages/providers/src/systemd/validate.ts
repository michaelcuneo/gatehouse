import type { Resource } from "@gatehouse/types";

export function validateServiceResource(resource: Resource): void {
  if (resource.kind !== "service") {
    throw new Error(
      `Systemd provider cannot reconcile resource kind "${resource.kind}"`,
    );
  }

  if (!resource.spec.workingDirectory.trim()) {
    throw new Error("Service working directory is required");
  }

  if (!resource.spec.startCommand.trim()) {
    throw new Error("Service start command is required");
  }

  for (const port of resource.spec.ports) {
    if (!Number.isInteger(port.port) || port.port < 1 || port.port > 65535) {
      throw new Error(
        `Invalid port "${port.port}" for service "${resource.name}"`,
      );
    }
  }
}
