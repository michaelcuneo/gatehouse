import {
  deleteManagedAcmCertificate,
  ensureAcmCertificate,
  getAcmCertificateState,
  reconcileAcmDnsValidation,
  type AcmCertificateSpec,
} from "@gatehouse/aws";
import type {
  AwsAcmCertificateSpec,
  CertificateResource,
  Resource,
} from "@gatehouse/types";
import type { ProviderContext } from "../types";

import { validateAcmResource } from "./validate";

type AwsAcmCertificateResource = CertificateResource & {
  spec: AwsAcmCertificateSpec;
};

function isAwsAcmCertificateResource(
  resource: Resource,
): resource is AwsAcmCertificateResource {
  return (
    resource.kind === "certificate" &&
    resource.spec.provider === "aws_acm"
  );
}

function target(resource: Resource, context: ProviderContext) {
  validateAcmResource(resource, context);

  if (!isAwsAcmCertificateResource(resource)) {
    throw new Error("ACM provider requires an AWS ACM certificate resource");
  }

  const stage = context.projectStages[0]?.stage;

  if (!stage) {
    throw new Error("ACM provider requires an attached project stage");
  }

  const spec: AcmCertificateSpec = {
    resourceId: resource.id,
    domains: resource.spec.domains,
    wildcard: resource.spec.wildcard,
    region: resource.spec.region ?? "us-east-1",
    certificateArn: resource.spec.certificateArn,
    validation: resource.spec.validation ?? "dns",
  };

  return {
    resource,
    stage,
    spec,
  };
}

export async function reconcileAcmResource(
  resource: Resource,
  context: ProviderContext,
): Promise<void> {
  const resolved = target(resource, context);

  if (resolved.spec.certificateArn) {
    return;
  }

  const state = await ensureAcmCertificate(
    resolved.stage,
    resolved.spec,
  );

  if (resolved.spec.validation === "dns") {
    await reconcileAcmDnsValidation(
      resolved.stage,
      state,
    );
  }
}

export async function destroyAcmResource(
  resource: Resource,
  context: ProviderContext,
): Promise<void> {
  const resolved = target(resource, context);

  if (resource.metadata?.managed !== true) {
    return;
  }

  await deleteManagedAcmCertificate(
    resolved.stage,
    resolved.spec,
  );
}

export async function healthAcmResource(
  resource: Resource,
  context: ProviderContext,
) {
  const resolved = target(resource, context);
  const state = await getAcmCertificateState(
    resolved.stage,
    resolved.spec,
  );

  if (!state) {
    return {
      healthy: false,
      message: "ACM certificate does not exist",
    };
  }

  if (state.status !== "ISSUED") {
    return {
      healthy: false,
      message: `ACM certificate status is ${state.status ?? "unknown"}`,
    };
  }

  const desiredDomains = new Set<string>(
    resolved.resource.spec.domains
      .map((domain: string) => domain.trim().toLowerCase())
      .filter(Boolean),
  );

  if (resolved.resource.spec.wildcard) {
    const primary = [...desiredDomains][0];

    if (primary) {
      desiredDomains.add(
        primary.startsWith("*.") ? primary : `*.${primary}`,
      );
    }
  }

  const actualDomains = new Set<string>(state.domains);

  if (
    desiredDomains.size !== actualDomains.size ||
    [...desiredDomains].some(
      (domain: string) => !actualDomains.has(domain),
    )
  ) {
    return {
      healthy: false,
      message: "ACM certificate domains differ from desired state",
    };
  }

  const desiredValidation =
    (resolved.resource.spec.validation ?? "dns") === "email"
      ? "EMAIL"
      : "DNS";

  if (
    state.validationMethod &&
    state.validationMethod !== desiredValidation
  ) {
    return {
      healthy: false,
      message: "ACM certificate validation method differs from desired state",
    };
  }

  return {
    healthy: true,
    message: `ACM certificate is issued and matches desired state (${state.arn})`,
  };
}
