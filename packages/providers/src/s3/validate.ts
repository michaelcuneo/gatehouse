import type { Resource } from "@gatehouse/types";
import type { ProviderContext } from "../types";

export function validateS3Resource(
  resource: Resource,
  context: ProviderContext,
): void {
  if (resource.kind !== "storage_bucket") {
    throw new Error(
      `S3 provider cannot reconcile resource kind "${resource.kind}"`,
    );
  }

  if (resource.spec.provider !== "s3") {
    throw new Error(
      `S3 provider cannot manage storage provider "${resource.spec.provider}"`,
    );
  }

  if (context.projectStages.length !== 1) {
    throw new Error(
      `S3 resource "${resource.name}" must be attached to exactly one project stage`,
    );
  }

  if (!resource.spec.bucket.trim()) {
    throw new Error("S3 bucket name is required");
  }

  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(resource.spec.bucket)) {
    throw new Error(
      `Invalid S3 bucket name "${resource.spec.bucket}"`,
    );
  }

  if (
    resource.spec.bucket.includes("..") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(resource.spec.bucket)
  ) {
    throw new Error(
      `Invalid S3 bucket name "${resource.spec.bucket}"`,
    );
  }

  if (!resource.spec.region.trim()) {
    throw new Error("S3 bucket region is required");
  }
}
