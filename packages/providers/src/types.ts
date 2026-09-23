import type { Resource } from "@gatehouse/types";

export interface ProviderHealth {
  healthy: boolean;
  message?: string;
}

export interface Provider {
  name: Resource["provider"];

  reconcile(resource: Resource): Promise<void>;

  destroy?(resource: Resource): Promise<void>;

  health?(resource: Resource): Promise<ProviderHealth>;
}
