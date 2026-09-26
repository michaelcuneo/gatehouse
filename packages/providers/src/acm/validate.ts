import type { Resource } from "@gatehouse/types";
import type { ProviderContext } from "../types";

export function validateAcmResource(
  resource: Resource,
  context: ProviderContext,
): void {
  if (resource.kind !== "certificate") {
    throw new Error(
      `ACM provider cannot reconcile resource kind "${resource.kind}"`,
    );
  }

  if (resource.spec.provider !== "aws_acm") {
    throw new Error(
      `ACM provider cannot manage certificate provider "${resource.spec.provider}"`,
    );
  }

  if (context.projectStages.length !== 1) {
    throw new Error(
      `ACM certificate "${resource.name}" must be attached to exactly one project stage`,
    );
  }

  const domains = resource.spec.domains
    .map((domain) => domain.trim())
    .filter(Boolean);

  if (!domains.length) {
    throw new Error("ACM certificate requires at least one domain");
  }

  if (
    resource.spec.validation &&
    resource.spec.validation !== "dns" &&
    resource.spec.validation !== "email"
  ) {
    throw new Error("ACM validation must be dns or email");
  }
}
