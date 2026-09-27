import type { ProjectStageContext } from "@gatehouse/core";
import type { Resource } from "@gatehouse/types";

export interface ProviderHealth {
  healthy: boolean;
  message?: string;
}

export interface ProviderDeploymentContext {
  artifactFingerprint?: string;
  skipArtifactTransfer?: boolean;
}

export interface ProviderContext {
  projectStages: ProjectStageContext[];
  dependencies: Resource[];
  dependencyStages: Record<string, ProjectStageContext[]>;
  deployment?: ProviderDeploymentContext;
}

export interface ProviderReconcileResult {
  artifactTransferred?: boolean;
  message?: string;
}

export interface Provider {
  name: Resource["provider"];

  reconcile(
    resource: Resource,
    context: ProviderContext,
  ): Promise<ProviderReconcileResult | void>;

  destroy?(
    resource: Resource,
    context: ProviderContext,
  ): Promise<void>;

  health?(
    resource: Resource,
    context: ProviderContext,
  ): Promise<ProviderHealth>;
}
