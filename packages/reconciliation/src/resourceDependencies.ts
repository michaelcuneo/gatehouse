import type { Resource } from "@gatehouse/types";

export function resourceDependencyIds(
  resource: Resource,
): string[] {
  const dependencies = new Set(
    resource.metadata?.dependsOn ?? [],
  );

  if (
    resource.kind === "dns_record" &&
    resource.spec.mode === "cloudfront_alias"
  ) {
    dependencies.add(resource.spec.staticSiteId);
  }

  if (resource.kind === "static_site") {
    if (resource.spec.endpointId) {
      dependencies.add(resource.spec.endpointId);
    }

    if (resource.spec.storageId) {
      dependencies.add(resource.spec.storageId);
    }

    if (resource.spec.cloudFront?.certificateId) {
      dependencies.add(resource.spec.cloudFront.certificateId);
    }
  }

  return [...dependencies];
}
