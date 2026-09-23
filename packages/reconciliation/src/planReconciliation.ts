import type { Resource } from "@gatehouse/types";

function dependencyIds(resource: Resource): string[] {
  const dependencies = new Set(resource.metadata?.dependsOn ?? []);

  if (resource.kind === "static_site") {
    if (resource.spec.endpointId) {
      dependencies.add(resource.spec.endpointId);
    }

    if (resource.spec.storageId) {
      dependencies.add(resource.spec.storageId);
    }
  }

  return [...dependencies];
}

export function planReconciliation(
  resources: Resource[],
  targetIds?: string[],
): Resource[] {
  const byId = new Map(resources.map((resource) => [resource.id, resource]));
  const ordered: Resource[] = [];
  const permanent = new Set<string>();
  const temporary = new Set<string>();

  function visit(resourceId: string, lineage: string[]): void {
    if (permanent.has(resourceId)) {
      return;
    }

    const resource = byId.get(resourceId);

    if (!resource) {
      throw new Error(
        `Resource dependency "${resourceId}" does not exist`,
      );
    }

    if (temporary.has(resourceId)) {
      const cycle = [...lineage, resourceId].join(" -> ");
      throw new Error(`Resource dependency cycle detected: ${cycle}`);
    }

    temporary.add(resourceId);

    for (const dependencyId of dependencyIds(resource)) {
      const dependency = byId.get(dependencyId);

      if (!dependency) {
        throw new Error(
          `Resource "${resource.name}" depends on missing resource "${dependencyId}"`,
        );
      }

      if (!dependency.enabled) {
        throw new Error(
          `Resource "${resource.name}" depends on disabled resource "${dependency.name}"`,
        );
      }

      visit(dependencyId, [...lineage, resourceId]);
    }

    temporary.delete(resourceId);
    permanent.add(resourceId);
    ordered.push(resource);
  }

  const roots = targetIds?.length
    ? targetIds
    : resources.map((resource) => resource.id);

  for (const resourceId of roots) {
    visit(resourceId, []);
  }

  return ordered;
}
