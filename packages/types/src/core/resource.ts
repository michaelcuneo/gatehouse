import type { ResourceId, Timestamp } from "./common";
import type { ResourceProvider } from "./provider";

export const RESOURCE_KINDS = {
  ENDPOINT: "endpoint",
  SERVICE: "service",
  CERTIFICATE: "certificate",
  DNS_RECORD: "dns_record",
  STORAGE_BUCKET: "storage_bucket",
  STATIC_SITE: "static_site",
} as const;

export type ResourceKind = (typeof RESOURCE_KINDS)[keyof typeof RESOURCE_KINDS];

export type ResourceStatus =
  | "pending"
  | "reconciling"
  | "ready"
  | "error"
  | "disabled";

export interface BaseResource<TKind extends ResourceKind, TSpec> {
  id: string;

  kind: TKind;

  name: string;

  provider: ResourceProvider;

  version: number;

  enabled: boolean;

  status: ResourceStatus;

  createdAt: Timestamp;

  updatedAt: Timestamp;

  metadata?: {
    description?: string;

    tags?: string[];

    managed?: boolean;

    dependsOn?: ResourceId[];
  };

  runtime?: {
    lastReconciledAt?: Timestamp;

    lastError?: string;

    lastStatusMessage?: string;

    healthy?: boolean;
  };

  spec: TSpec;
}
