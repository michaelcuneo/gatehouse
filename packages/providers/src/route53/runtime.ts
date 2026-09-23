import {
  ChangeResourceRecordSetsCommand,
  ListHostedZonesByNameCommand,
  ListResourceRecordSetsCommand,
  type ResourceRecordSet,
} from "@aws-sdk/client-route-53";

import { awsClientsForStage } from "@gatehouse/aws";
import type { ManagedStage } from "@gatehouse/core";
import type { DNSRecordResource } from "@gatehouse/types";

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

function desiredRecord(resource: DNSRecordResource): ResourceRecordSet {
  return {
    Name: fqdn(resource.spec.name),
    Type: resource.spec.type,
    TTL: resource.spec.ttl ?? 300,
    ResourceRecords: [{ Value: resource.spec.value }],
  };
}

export async function upsertRoute53Record(
  resource: DNSRecordResource,
  stage: ManagedStage,
): Promise<void> {
  const { route53 } = awsClientsForStage(stage);
  const HostedZoneId = await hostedZoneId(stage, resource.spec.zone);

  await route53.send(
    new ChangeResourceRecordSetsCommand({
      HostedZoneId,
      ChangeBatch: {
        Comment: `Managed by GateHouse resource ${resource.id}`,
        Changes: [
          {
            Action: "UPSERT",
            ResourceRecordSet: desiredRecord(resource),
          },
        ],
      },
    }),
  );
}

export async function removeRoute53Record(
  resource: DNSRecordResource,
  stage: ManagedStage,
): Promise<void> {
  const { route53 } = awsClientsForStage(stage);
  const HostedZoneId = await hostedZoneId(stage, resource.spec.zone);

  const existing = await findRoute53Record(resource, stage);

  if (!existing) {
    return;
  }

  await route53.send(
    new ChangeResourceRecordSetsCommand({
      HostedZoneId,
      ChangeBatch: {
        Comment: `Removed by GateHouse resource ${resource.id}`,
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

export async function findRoute53Record(
  resource: DNSRecordResource,
  stage: ManagedStage,
): Promise<ResourceRecordSet | null> {
  const { route53 } = awsClientsForStage(stage);
  const HostedZoneId = await hostedZoneId(stage, resource.spec.zone);

  const result = await route53.send(
    new ListResourceRecordSetsCommand({
      HostedZoneId,
      StartRecordName: fqdn(resource.spec.name),
      StartRecordType: resource.spec.type,
      MaxItems: 1,
    }),
  );

  const record = result.ResourceRecordSets?.[0];

  if (
    !record ||
    normalizeDnsName(record.Name ?? "") !==
      normalizeDnsName(resource.spec.name) ||
    record.Type !== resource.spec.type
  ) {
    return null;
  }

  return record;
}

export function route53RecordMatchesDesired(
  record: ResourceRecordSet,
  resource: DNSRecordResource,
): boolean {
  const desired = desiredRecord(resource);

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
