import type { Resource } from "@gatehouse/types";
import type { ProviderContext } from "../types";

import {
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

  await upsertRoute53Record(
    dnsRecord(resource),
    stage(context),
    context,
  );
}

export async function destroyRoute53Resource(
  resource: Resource,
  context: ProviderContext,
): Promise<void> {
  validateRoute53Resource(resource, context);

  await removeRoute53Record(
    dnsRecord(resource),
    stage(context),
    context,
  );
}

export async function healthRoute53Resource(
  resource: Resource,
  context: ProviderContext,
) {
  validateRoute53Resource(resource, context);

  const healthy = await route53RecordMatchesDesired(
    dnsRecord(resource),
    stage(context),
    context,
  );

  return {
    healthy,
    message: healthy
      ? "Route53 record matches desired state"
      : "Route53 record differs from desired state",
  };
}
