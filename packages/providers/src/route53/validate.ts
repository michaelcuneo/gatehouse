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

  if (resource.spec.mode === "cloudfront_alias") {
    const staticSiteId = resource.spec.staticSiteId;

    if (!staticSiteId) {
      throw new Error("CloudFront alias requires a static-site dependency");
    }

    const dependency = context.dependencies.find(
      (candidate) => candidate.id === staticSiteId,
    );

    if (!dependency || dependency.kind !== "static_site") {
      throw new Error(
        `CloudFront alias "${resource.name}" requires its configured static-site dependency`,
      );
    }

    const targetStage = context.projectStages[0]?.stage;
    const dependencyStages =
      context.dependencyStages[staticSiteId] ?? [];

    if (
      !targetStage ||
      dependencyStages.length !== 1 ||
      dependencyStages[0].stage.id !== targetStage.id
    ) {
      throw new Error(
        "CloudFront alias and static site must belong to the same project stage",
      );
    }

    return;
  }

  if (!resource.spec.value.trim()) {
    throw new Error("DNS record value is required");
  }

  const ttl = resource.spec.ttl ?? 300;

  if (!Number.isInteger(ttl) || ttl < 1 || ttl > 2147483647) {
    throw new Error("DNS TTL must be a positive 32-bit integer");
  }
}
