import type { BaseResource } from "../core/resource";
import type { ResourceId } from "../core/common";

export interface StaticSiteCloudFrontSpec {
  enabled: boolean;

  /**
   * Optional existing distribution to adopt for invalidation/health only.
   * When omitted, GateHouse owns the distribution lifecycle.
   */
  distributionId?: string;

  defaultRootObject?: string;
}

export interface StaticSiteSpec {
  buildDirectory: string;

  /**
   * Required for filesystem deployments.
   * S3 deployments use storageId + prefix instead.
   */
  outputDirectory?: string;

  endpointId?: ResourceId;

  storageId?: ResourceId;

  /**
   * Optional object-key prefix for S3 deployments.
   */
  prefix?: string;

  cloudFront?: StaticSiteCloudFrontSpec;

  deployOnChange?: boolean;
}

export type StaticSiteResource = BaseResource<"static_site", StaticSiteSpec>;
