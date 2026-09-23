import type { BaseResource } from "../core/resource";

export type CertificateProvider = "acme" | "aws_acm";

export interface CertificateSpec {
  domains: string[];

  wildcard?: boolean;

  provider: CertificateProvider;

  email: string;

  autoRenew?: boolean;
}

export type CertificateResource = BaseResource<"certificate", CertificateSpec>;
