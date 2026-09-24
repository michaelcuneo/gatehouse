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

async function hostedZoneId(
  stage: ManagedStage,
  zoneName: string,
): Promise<string> {
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

  const id = zone?.Id?.replace(/^\/hostedzone\//, "");

  if (!id) {
    throw new Error(`Route53 hosted zone not found: ${zoneName}`);
  }

  return id;
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
