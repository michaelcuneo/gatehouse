import type { BaseResource } from "../core/resource";

export type CertificateProvider = "acme" | "aws_acm";

interface CertificateSpecBase {
  domains: string[];

  /**
   * Convenience flag: include a wildcard SAN for the primary domain.
   */
  wildcard?: boolean;

  autoRenew?: boolean;
}

export interface AcmeCertificateSpec extends CertificateSpecBase {
  provider: "acme";

  email: string;
}

export interface AwsAcmCertificateSpec extends CertificateSpecBase {
  provider: "aws_acm";

  /**
   * ACM region. CloudFront certificates must use us-east-1.
   */
  region?: string;

  /**
   * Existing ACM certificate to adopt instead of creating a managed one.
   */
  certificateArn?: string;

  validation?: "dns" | "email";
}

export type CertificateSpec =
  | AcmeCertificateSpec
  | AwsAcmCertificateSpec;

export type CertificateResource = BaseResource<"certificate", CertificateSpec>;
