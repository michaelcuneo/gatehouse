import type { ProjectStageContext } from "@gatehouse/core";
import type { Resource } from "@gatehouse/types";

export interface ProviderHealth {
  healthy: boolean;
  message?: string;
}

export interface ProviderContext {
  projectStages: ProjectStageContext[];
  dependencies: Resource[];
  dependencyStages: Record<string, ProjectStageContext[]>;
}

export interface Provider {
  name: Resource["provider"];

  reconcile(
    resource: Resource,
    context: ProviderContext,
  ): Promise<void>;

  destroy?(
    resource: Resource,
    context: ProviderContext,
  ): Promise<void>;

  health?(
    resource: Resource,
    context: ProviderContext,
  ): Promise<ProviderHealth>;
}
