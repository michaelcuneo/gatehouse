import type { Resource } from "@gatehouse/types";

export interface Provider {
  name: string;

  reconcile(resource: Resource): Promise<void>;
}
