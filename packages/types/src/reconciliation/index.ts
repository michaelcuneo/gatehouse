import type { Resource } from "../resources";

export interface ReconciliationResult {
  success: boolean;

  changed: boolean;

  message?: string;

  warnings?: string[];

  errors?: string[];
}

export interface ReconciliationContext {
  dryRun?: boolean;

  force?: boolean;

  triggeredBy?: string;
}

export interface ResourceProviderHandler<T extends Resource = Resource> {
  validate(resource: T): Promise<void>;

  reconcile(
    resource: T,
    context: ReconciliationContext,
  ): Promise<ReconciliationResult>;

  destroy?(resource: T): Promise<ReconciliationResult>;
}
