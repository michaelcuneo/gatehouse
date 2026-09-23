import type { Resource } from "@gatehouse/types";

export interface Provider {
  name: Resource["provider"];

  reconcile(resource: Resource): Promise<void>;
}
