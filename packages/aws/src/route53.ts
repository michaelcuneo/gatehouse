import {
  ChangeResourceRecordSetsCommand,
  ListHostedZonesByNameCommand,
  ListResourceRecordSetsCommand,
  type ResourceRecordSet,
} from "@aws-sdk/client-route-53";

import type { ManagedStage } from "@gatehouse/core";

import { awsClientsForStage } from "./clients";

export interface Route53RecordSpec {
  zone: string;
  name: string;
  type: "A" | "AAAA" | "CNAME" | "TXT";
  value: string;
  ttl: number;
}

function normalizeDnsName(value: string): string {
  return value.trim().replace(/\.+$/, "").toLowerCase();
}

function fqdn(value: string): string {
  const normalized = normalizeDnsName(value);
  return normalized ? `${normalized}.` : ".";
}

async function tryHostedZoneId(
  stage: ManagedStage,
  zoneName: string,
): Promise<string | null> {
  const { route53 } = awsClientsForStage(stage);
  const normalized = normalizeDnsName(zoneName);

  const result = await route53.send(
    new ListHostedZonesByNameCommand({
      DNSName: fqdn(normalized),
      MaxItems: 10,
    }),
  );

  const zone = result.HostedZones?.find(
    (candidate) => normalizeDnsName(candidate.Name ?? "") === normalized,
  );

  return zone?.Id?.replace(/^\/hostedzone\//, "") ?? null;
}

async function hostedZoneId(
  stage: ManagedStage,
  zoneName: string,
): Promise<string> {
  const id = await tryHostedZoneId(stage, zoneName);

  if (!id) {
    throw new Error(`Route53 hosted zone not found: ${zoneName}`);
  }

  return id;
}

async function bestHostedZoneId(
  stage: ManagedStage,
  recordName: string,
): Promise<string> {
  const labels = normalizeDnsName(recordName).split(".").filter(Boolean);

  for (let index = 0; index < labels.length - 1; index += 1) {
    const candidate = labels.slice(index).join(".");
    const id = await tryHostedZoneId(stage, candidate);

    if (id) {
      return id;
    }
  }

  throw new Error(
    `No Route53 hosted zone matches record "${recordName}"`,
  );
}

function desiredRecord(spec: Route53RecordSpec): ResourceRecordSet {
  return {
    Name: fqdn(spec.name),
    Type: spec.type,
    TTL: spec.ttl,
    ResourceRecords: [{ Value: spec.value }],
  };
}

export async function upsertRoute53Record(
  stage: ManagedStage,
  spec: Route53RecordSpec,
  comment?: string,
): Promise<void> {
  const { route53 } = awsClientsForStage(stage);
  const HostedZoneId = await hostedZoneId(stage, spec.zone);

  await route53.send(
    new ChangeResourceRecordSetsCommand({
      HostedZoneId,
      ChangeBatch: {
        Comment: comment,
        Changes: [
          {
            Action: "UPSERT",
            ResourceRecordSet: desiredRecord(spec),
          },
        ],
      },
    }),
  );
}

export async function findRoute53Record(
  stage: ManagedStage,
  spec: Route53RecordSpec,
): Promise<ResourceRecordSet | null> {
  const { route53 } = awsClientsForStage(stage);
  const HostedZoneId = await hostedZoneId(stage, spec.zone);

  const result = await route53.send(
    new ListResourceRecordSetsCommand({
      HostedZoneId,
      StartRecordName: fqdn(spec.name),
      StartRecordType: spec.type,
      MaxItems: 1,
    }),
  );

  const record = result.ResourceRecordSets?.[0];

  if (
    !record ||
    normalizeDnsName(record.Name ?? "") !== normalizeDnsName(spec.name) ||
    record.Type !== spec.type
  ) {
    return null;
  }

  return record;
}

export async function removeRoute53Record(
  stage: ManagedStage,
  spec: Route53RecordSpec,
  comment?: string,
): Promise<void> {
  const { route53 } = awsClientsForStage(stage);
  const HostedZoneId = await hostedZoneId(stage, spec.zone);
  const existing = await findRoute53Record(stage, spec);

  if (!existing) {
    return;
  }

  await route53.send(
    new ChangeResourceRecordSetsCommand({
      HostedZoneId,
      ChangeBatch: {
        Comment: comment,
        Changes: [
          {
            Action: "DELETE",
            ResourceRecordSet: existing,
          },
        ],
      },
    }),
  );
}

export function route53RecordMatchesDesired(
  record: ResourceRecordSet,
  spec: Route53RecordSpec,
): boolean {
  const desired = desiredRecord(spec);

  const actualValues = (record.ResourceRecords ?? [])
    .map((item) => item.Value ?? "")
    .sort();

  const desiredValues = (desired.ResourceRecords ?? [])
    .map((item) => item.Value ?? "")
    .sort();

  return (
    record.Type === desired.Type &&
    record.TTL === desired.TTL &&
    JSON.stringify(actualValues) === JSON.stringify(desiredValues)
  );
}


export async function upsertRoute53RecordInBestZone(
  stage: ManagedStage,
  spec: Omit<Route53RecordSpec, "zone">,
  comment?: string,
): Promise<void> {
  const { route53 } = awsClientsForStage(stage);
  const HostedZoneId = await bestHostedZoneId(stage, spec.name);

  await route53.send(
    new ChangeResourceRecordSetsCommand({
      HostedZoneId,
      ChangeBatch: {
        Comment: comment,
        Changes: [
          {
            Action: "UPSERT",
            ResourceRecordSet: {
              Name: fqdn(spec.name),
              Type: spec.type,
              TTL: spec.ttl,
              ResourceRecords: [{ Value: spec.value }],
            },
          },
        ],
      },
    }),
  );
}


const CLOUDFRONT_HOSTED_ZONE_ID = "Z2FDTNDATAQYW2";

async function findRecordInBestZone(
  stage: ManagedStage,
  name: string,
  type: "A" | "AAAA",
): Promise<ResourceRecordSet | null> {
  const { route53 } = awsClientsForStage(stage);
  const HostedZoneId = await bestHostedZoneId(stage, name);

  const result = await route53.send(
    new ListResourceRecordSetsCommand({
      HostedZoneId,
      StartRecordName: fqdn(name),
      StartRecordType: type,
      MaxItems: 1,
    }),
  );

  const record = result.ResourceRecordSets?.[0];

  if (
    !record ||
    normalizeDnsName(record.Name ?? "") !== normalizeDnsName(name) ||
    record.Type !== type
  ) {
    return null;
  }

  return record;
}

function cloudFrontAliasRecord(
  hostname: string,
  distributionDomain: string,
  type: "A" | "AAAA",
): ResourceRecordSet {
  return {
    Name: fqdn(hostname),
    Type: type,
    AliasTarget: {
      DNSName: fqdn(distributionDomain),
      HostedZoneId: CLOUDFRONT_HOSTED_ZONE_ID,
      EvaluateTargetHealth: false,
    },
  };
}

function aliasPointsToCloudFront(
  record: ResourceRecordSet,
  distributionDomain: string,
): boolean {
  return (
    normalizeDnsName(record.AliasTarget?.DNSName ?? "") ===
      normalizeDnsName(distributionDomain) &&
    record.AliasTarget?.HostedZoneId === CLOUDFRONT_HOSTED_ZONE_ID
  );
}

export async function ensureRoute53CloudFrontAliases(
  stage: ManagedStage,
  hostname: string,
  distributionDomain: string,
): Promise<void> {
  const { route53 } = awsClientsForStage(stage);
  const HostedZoneId = await bestHostedZoneId(stage, hostname);

  for (const type of ["A", "AAAA"] as const) {
    const existing = await findRecordInBestZone(
      stage,
      hostname,
      type,
    );

    if (existing && !aliasPointsToCloudFront(existing, distributionDomain)) {
      throw new Error(
        `Refusing to overwrite existing Route53 ${type} record for "${hostname}"`,
      );
    }

    await route53.send(
      new ChangeResourceRecordSetsCommand({
        HostedZoneId,
        ChangeBatch: {
          Comment: "Managed by GateHouse CloudFront static site",
          Changes: [
            {
              Action: "UPSERT",
              ResourceRecordSet: cloudFrontAliasRecord(
                hostname,
                distributionDomain,
                type,
              ),
            },
          ],
        },
      }),
    );
  }
}

export async function removeRoute53CloudFrontAliases(
  stage: ManagedStage,
  hostname: string,
  distributionDomain: string,
): Promise<void> {
  const { route53 } = awsClientsForStage(stage);
  const HostedZoneId = await bestHostedZoneId(stage, hostname);

  for (const type of ["A", "AAAA"] as const) {
    const existing = await findRecordInBestZone(
      stage,
      hostname,
      type,
    );

    if (!existing) {
      continue;
    }

    if (!aliasPointsToCloudFront(existing, distributionDomain)) {
      continue;
    }

    await route53.send(
      new ChangeResourceRecordSetsCommand({
        HostedZoneId,
        ChangeBatch: {
          Comment: "Removed by GateHouse CloudFront static site",
          Changes: [
            {
              Action: "DELETE",
              ResourceRecordSet: existing,
            },
          ],
        },
      }),
    );
  }
}

export async function route53CloudFrontAliasesHealthy(
  stage: ManagedStage,
  hostname: string,
  distributionDomain: string,
): Promise<boolean> {
  const records = await Promise.all(
    (["A", "AAAA"] as const).map((type) =>
      findRecordInBestZone(stage, hostname, type),
    ),
  );

  return records.every(
    (record) =>
      record !== null &&
      aliasPointsToCloudFront(record, distributionDomain),
  );
}
