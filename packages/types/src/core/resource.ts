import type { ResourceId, Timestamp } from "./common";
import type { ResourceProvider } from "./provider";

export const RESOURCE_KINDS = {
  ENDPOINT: "endpoint",
  SERVICE: "service",
  CERTIFICATE: "certificate",
  DNS_RECORD: "dns_record",
  STORAGE_BUCKET: "storage_bucket",
  STATIC_SITE: "static_site",
  DATABASE_TABLE: "database_table",
  FUNCTION: "function",
} as const;

export type ResourceKind = (typeof RESOURCE_KINDS)[keyof typeof RESOURCE_KINDS];

export type ResourceStatus =
  | "pending"
  | "reconciling"
  | "ready"
  | "error"
  | "disabled";

export type ResourceOwnershipMode =
  | "gatehouse"
  | "external"
  | "observed";

export interface ResourceOwnership {
  mode: ResourceOwnershipMode;
  externalOwner?: {
    type: "cloudformation" | "sst" | "cdk" | "unknown";
    id?: string;
    name?: string;
  };
}

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

    /**
     * Legacy ownership flag. New code should use ownership.
     * true means GateHouse-owned; false means externally owned.
     */
    managed?: boolean;

    ownership?: ResourceOwnership;

    importedFrom?: {
      provider: "aws";
      discoveryId: string;
      physicalId: string;
      accountId: string;
      region: string;
      importedAt: Timestamp;
    };

    dependsOn?: ResourceId[];
  };

  runtime?: {
    lastReconciledAt?: Timestamp;

    lastError?: string;

    lastStatusMessage?: string;

    healthy?: boolean;

    lastHealthCheckAt?: Timestamp;

    lastHealthMessage?: string;
  };

  spec: TSpec;
}
