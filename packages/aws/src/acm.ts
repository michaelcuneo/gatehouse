import {
  DeleteCertificateCommand,
  DescribeCertificateCommand,
  ListCertificatesCommand,
  ListTagsForCertificateCommand,
  RequestCertificateCommand,
  type CertificateDetail,
} from "@aws-sdk/client-acm";

import type { ManagedStage } from "@gatehouse/core";

import { awsClientsForStage } from "./clients";
import {
  upsertRoute53RecordInBestZone,
  type Route53RecordSpec,
} from "./route53";

export interface AcmCertificateSpec {
  resourceId: string;
  domains: string[];
  wildcard?: boolean;
  region: string;
  certificateArn?: string;
  validation?: "dns" | "email";
}

export interface AcmCertificateState {
  arn: string;
  status?: string;
  domainName?: string;
  inUseBy: string[];
  validationRecords: Array<Omit<Route53RecordSpec, "zone">>;
}

function normalizedDomains(spec: AcmCertificateSpec): string[] {
  const domains = spec.domains
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);

  if (!domains.length) {
    throw new Error("ACM certificate requires at least one domain");
  }

  if (spec.wildcard) {
    const primary = domains[0];
    const wildcard = primary.startsWith("*.")
      ? primary
      : `*.${primary}`;

    if (!domains.includes(wildcard)) {
      domains.push(wildcard);
    }
  }

  return [...new Set(domains)];
}

function managedTagValue(resourceId: string): string {
  return `gatehouse:${resourceId}`;
}

function certificateClient(stage: ManagedStage, region: string) {
  return awsClientsForStage(stage, region).acm;
}

async function describeCertificate(
  stage: ManagedStage,
  region: string,
  arn: string,
): Promise<CertificateDetail | null> {
  const acm = certificateClient(stage, region);

  try {
    const result = await acm.send(
      new DescribeCertificateCommand({
        CertificateArn: arn,
      }),
    );

    return result.Certificate ?? null;
  } catch (cause) {
    const name =
      cause && typeof cause === "object" && "name" in cause
        ? String((cause as { name?: unknown }).name)
        : "";

    if (name === "ResourceNotFoundException") {
      return null;
    }

    throw cause;
  }
}

async function findManagedCertificateArn(
  stage: ManagedStage,
  spec: AcmCertificateSpec,
): Promise<string | null> {
  if (spec.certificateArn) {
    return spec.certificateArn;
  }

  const acm = certificateClient(stage, spec.region);
  let nextToken: string | undefined;
  const domains = normalizedDomains(spec);
  const primary = domains[0];

  do {
    const result = await acm.send(
      new ListCertificatesCommand({
        NextToken: nextToken,
        CertificateStatuses: [
          "PENDING_VALIDATION",
          "ISSUED",
          "INACTIVE",
          "EXPIRED",
          "VALIDATION_TIMED_OUT",
          "REVOKED",
          "FAILED",
        ],
      }),
    );

    for (const summary of result.CertificateSummaryList ?? []) {
      if (!summary.CertificateArn) continue;
      if ((summary.DomainName ?? "").toLowerCase() !== primary) continue;

      const tags = await acm.send(
        new ListTagsForCertificateCommand({
          CertificateArn: summary.CertificateArn,
        }),
      );

      const managed = (tags.Tags ?? []).some(
        (tag) =>
          tag.Key === "GateHouseResource" &&
          tag.Value === managedTagValue(spec.resourceId),
      );

      if (!managed) continue;

      const detail = await describeCertificate(
        stage,
        spec.region,
        summary.CertificateArn,
      );

      if (detail?.CertificateArn) {
        const sans = new Set(
          (detail.SubjectAlternativeNames ?? [])
            .map((domain) => domain.toLowerCase()),
        );

        const domainMatch = domains.every((domain) => sans.has(domain));

        if (domainMatch) {
          return detail.CertificateArn;
        }
      }
    }

    nextToken = result.NextToken;
  } while (nextToken);

  return null;
}

function validationRecords(
  detail: CertificateDetail,
): Array<Omit<Route53RecordSpec, "zone">> {
  const records: Array<Omit<Route53RecordSpec, "zone">> = [];

  for (const option of detail.DomainValidationOptions ?? []) {
    const record = option.ResourceRecord;

    if (!record?.Name || !record.Value || record.Type !== "CNAME") {
      continue;
    }

    records.push({
      name: record.Name,
      type: "CNAME",
      value: record.Value,
      ttl: 300,
    });
  }

  return records;
}

export async function ensureAcmCertificate(
  stage: ManagedStage,
  spec: AcmCertificateSpec,
): Promise<AcmCertificateState> {
  const existingArn = await findManagedCertificateArn(stage, spec);

  let arn = existingArn;

  if (!arn) {
    const acm = certificateClient(stage, spec.region);
    const domains = normalizedDomains(spec);
    const [DomainName, ...SubjectAlternativeNames] = domains;

    const result = await acm.send(
      new RequestCertificateCommand({
        DomainName,
        SubjectAlternativeNames:
          SubjectAlternativeNames.length
            ? SubjectAlternativeNames
            : undefined,
        ValidationMethod: spec.validation === "email" ? "EMAIL" : "DNS",
        IdempotencyToken: spec.resourceId
          .replace(/[^A-Za-z0-9]/g, "")
          .slice(0, 32),
        Options: {
          CertificateTransparencyLoggingPreference: "ENABLED",
        },
        Tags: [
          {
            Key: "GateHouseResource",
            Value: managedTagValue(spec.resourceId),
          },
        ],
      }),
    );

    arn = result.CertificateArn;
  }

  if (!arn) {
    throw new Error("ACM did not return a certificate ARN");
  }

  const detail = await describeCertificate(stage, spec.region, arn);

  if (!detail) {
    throw new Error(`ACM certificate "${arn}" could not be described`);
  }

  return {
    arn,
    status: detail.Status,
    domainName: detail.DomainName,
    inUseBy: detail.InUseBy ?? [],
    validationRecords: validationRecords(detail),
  };
}

export async function reconcileAcmDnsValidation(
  stage: ManagedStage,
  state: AcmCertificateState,
): Promise<void> {
  for (const record of state.validationRecords) {
    await upsertRoute53RecordInBestZone(
      stage,
      record,
      `GateHouse ACM validation for ${state.arn}`,
    );
  }
}

export async function getAcmCertificateState(
  stage: ManagedStage,
  spec: AcmCertificateSpec,
): Promise<AcmCertificateState | null> {
  const arn = await findManagedCertificateArn(stage, spec);

  if (!arn) {
    return null;
  }

  const detail = await describeCertificate(stage, spec.region, arn);

  if (!detail) {
    return null;
  }

  return {
    arn,
    status: detail.Status,
    domainName: detail.DomainName,
    inUseBy: detail.InUseBy ?? [],
    validationRecords: validationRecords(detail),
  };
}

export async function deleteManagedAcmCertificate(
  stage: ManagedStage,
  spec: AcmCertificateSpec,
): Promise<void> {
  if (spec.certificateArn) {
    return;
  }

  const arn = await findManagedCertificateArn(stage, spec);

  if (!arn) {
    return;
  }

  const state = await getAcmCertificateState(stage, spec);

  if (state?.inUseBy.length) {
    throw new Error(
      `Refusing to delete ACM certificate while it is in use by ${state.inUseBy.length} AWS resource(s)`,
    );
  }

  const acm = certificateClient(stage, spec.region);

  await acm.send(
    new DeleteCertificateCommand({
      CertificateArn: arn,
    }),
  );
}
