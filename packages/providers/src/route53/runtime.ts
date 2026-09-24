import {
  findRoute53Record as findAwsRoute53Record,
  removeRoute53Record as removeAwsRoute53Record,
  route53RecordMatchesDesired as awsRoute53RecordMatchesDesired,
  upsertRoute53Record as upsertAwsRoute53Record,
} from "@gatehouse/aws";
import type { ManagedStage } from "@gatehouse/core";
import type { DNSRecordResource } from "@gatehouse/types";

function recordSpec(resource: DNSRecordResource) {
  return {
    zone: resource.spec.zone,
    name: resource.spec.name,
    type: resource.spec.type,
    value: resource.spec.value,
    ttl: resource.spec.ttl ?? 300,
  };
}

export async function upsertRoute53Record(
  resource: DNSRecordResource,
  stage: ManagedStage,
): Promise<void> {
  await upsertAwsRoute53Record(
    stage,
    recordSpec(resource),
    `Managed by GateHouse resource ${resource.id}`,
  );
}

export async function removeRoute53Record(
  resource: DNSRecordResource,
  stage: ManagedStage,
): Promise<void> {
  await removeAwsRoute53Record(
    stage,
    recordSpec(resource),
    `Removed by GateHouse resource ${resource.id}`,
  );
}

export async function findRoute53Record(
  resource: DNSRecordResource,
  stage: ManagedStage,
) {
  return findAwsRoute53Record(stage, recordSpec(resource));
}

export function route53RecordMatchesDesired(
  record: NonNullable<Awaited<ReturnType<typeof findAwsRoute53Record>>>,
  resource: DNSRecordResource,
): boolean {
  return awsRoute53RecordMatchesDesired(record, recordSpec(resource));
}
