import type { BaseResource } from "../core/resource";

export type DNSRecordType = "A" | "AAAA" | "CNAME" | "TXT";

export interface DNSRecordSpec {
  zone: string;

  name: string;

  type: DNSRecordType;

  value: string;

  ttl?: number;
}

export type DNSRecordResource = BaseResource<"dns_record", DNSRecordSpec>;
