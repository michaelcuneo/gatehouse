import type { Resource } from "@gatehouse/types";
import type { ProviderContext } from "../types";

export function validateRoute53Resource(
  resource: Resource,
  context: ProviderContext,
): void {
  if (resource.kind !== "dns_record") {
    throw new Error(
      `Route53 provider cannot reconcile resource kind "${resource.kind}"`,
    );
  }

  if (context.projectStages.length !== 1) {
    throw new Error(
      `Route53 resource "${resource.name}" must be attached to exactly one project stage`,
    );
  }

  if (!resource.spec.zone.trim()) {
    throw new Error("Route53 hosted zone is required");
  }

  if (!resource.spec.name.trim()) {
    throw new Error("DNS record name is required");
  }

  if (!resource.spec.value.trim()) {
    throw new Error("DNS record value is required");
  }

  const ttl = resource.spec.ttl ?? 300;

  if (!Number.isInteger(ttl) || ttl < 1 || ttl > 2147483647) {
    throw new Error("DNS TTL must be a positive 32-bit integer");
  }
}
