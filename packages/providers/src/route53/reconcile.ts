import type { Resource } from "@gatehouse/types";
import type { ProviderContext } from "../types";

import {
  findRoute53Record,
  removeRoute53Record,
  route53RecordMatchesDesired,
  upsertRoute53Record,
} from "./runtime";
import { validateRoute53Resource } from "./validate";

function stage(context: ProviderContext) {
  const resolved = context.projectStages[0]?.stage;

  if (!resolved) {
    throw new Error("Route53 provider requires an attached project stage");
  }

  return resolved;
}

function dnsRecord(resource: Resource) {
  if (resource.kind !== "dns_record") {
    throw new Error("Route53 provider requires a DNS record resource");
  }

  return resource;
}

export async function reconcileRoute53Resource(
  resource: Resource,
  context: ProviderContext,
): Promise<void> {
  validateRoute53Resource(resource, context);
  await upsertRoute53Record(dnsRecord(resource), stage(context));
}

export async function destroyRoute53Resource(
  resource: Resource,
  context: ProviderContext,
): Promise<void> {
  validateRoute53Resource(resource, context);
  await removeRoute53Record(dnsRecord(resource), stage(context));
}

export async function healthRoute53Resource(
  resource: Resource,
  context: ProviderContext,
) {
  validateRoute53Resource(resource, context);

  const record = dnsRecord(resource);
  const existing = await findRoute53Record(record, stage(context));

  if (!existing) {
    return {
      healthy: false,
      message: "Route53 record does not exist",
    };
  }

  const matches = route53RecordMatchesDesired(existing, record);

  return {
    healthy: matches,
    message: matches
      ? "Route53 record matches desired state"
      : "Route53 record differs from desired state",
  };
}
