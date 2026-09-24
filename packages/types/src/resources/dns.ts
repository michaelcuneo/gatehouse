import type { ResourceId } from "../core/common";
import type { BaseResource } from "../core/resource";

export type DNSRecordType = "A" | "AAAA" | "CNAME" | "TXT";

export interface DNSValueRecordSpec {
  mode?: "value";

  zone: string;

  name: string;

  type: DNSRecordType;

  value: string;

  ttl?: number;
}

export interface DNSCloudFrontAliasSpec {
  mode: "cloudfront_alias";

  zone: string;

  name: string;

  staticSiteId: ResourceId;
}

export type DNSRecordSpec =
  | DNSValueRecordSpec
  | DNSCloudFrontAliasSpec;

export type DNSRecordResource = BaseResource<"dns_record", DNSRecordSpec>;
