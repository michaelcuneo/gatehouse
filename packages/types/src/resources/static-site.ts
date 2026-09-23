import type { BaseResource } from "../core/resource";
import type { ResourceId } from "../core/common";

export interface StaticSiteSpec {
  buildDirectory: string;

  outputDirectory: string;

  endpointId?: ResourceId;

  storageId?: ResourceId;

  deployOnChange?: boolean;
}

export type StaticSiteResource = BaseResource<"static_site", StaticSiteSpec>;
