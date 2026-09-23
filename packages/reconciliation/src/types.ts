import type { Resource } from "@gatehouse/types";

export interface Reconciler {
  reconcile(resource: Resource): Promise<void>;
}
