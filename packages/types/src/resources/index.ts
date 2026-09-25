export * from "./endpoint";
export * from "./service";
export * from "./certificate";
export * from "./dns";
export * from "./storage";
export * from "./static-site";
export * from "./database";

import type { EndpointResource } from "./endpoint";
import type { ServiceResource } from "./service";
import type { CertificateResource } from "./certificate";
import type { DNSRecordResource } from "./dns";
import type { StorageBucketResource } from "./storage";
import type { StaticSiteResource } from "./static-site";
import type { DatabaseTableResource } from "./database";

export type Resource =
  | EndpointResource
  | ServiceResource
  | CertificateResource
  | DNSRecordResource
  | StorageBucketResource
  | StaticSiteResource
  | DatabaseTableResource;
