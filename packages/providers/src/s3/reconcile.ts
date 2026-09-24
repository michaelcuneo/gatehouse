import {
  deleteEmptyS3Bucket,
  getS3BucketRegion,
  getS3PublicAccessBlocked,
  reconcileS3Bucket,
  s3BucketExists,
} from "@gatehouse/aws";
import type { Resource } from "@gatehouse/types";
import type {
  ProviderContext,
  ProviderReconcileResult,
} from "../types";

import {
  destroyS3StaticSite,
  healthS3StaticSite,
  reconcileS3StaticSite,
  validateS3StaticSite,
} from "./staticSite";
import { validateS3Resource } from "./validate";

function storageTarget(resource: Resource, context: ProviderContext) {
  validateS3Resource(resource, context);

  if (
    resource.kind !== "storage_bucket" ||
    resource.spec.provider !== "s3"
  ) {
    throw new Error("S3 provider requires an S3 storage resource");
  }

  const stage = context.projectStages[0]?.stage;

  if (!stage) {
    throw new Error("S3 provider requires an attached project stage");
  }

  return {
    stage,
    resource,
    spec: {
      bucket: resource.spec.bucket,
      region: resource.spec.region,
      public: resource.spec.public,
    },
  };
}

export async function reconcileS3Resource(
  resource: Resource,
  context: ProviderContext,
): Promise<ProviderReconcileResult | void> {
  if (resource.kind === "static_site") {
    validateS3StaticSite(resource, context);
    return reconcileS3StaticSite(resource, context);
  }

  const resolved = storageTarget(resource, context);

  await reconcileS3Bucket(resolved.stage, resolved.spec);
}

export async function destroyS3Resource(
  resource: Resource,
  context: ProviderContext,
): Promise<void> {
  if (resource.kind === "static_site") {
    validateS3StaticSite(resource, context);
    await destroyS3StaticSite(resource, context);
    return;
  }

  const resolved = storageTarget(resource, context);

  if (resource.metadata?.managed !== true) {
    return;
  }

  await deleteEmptyS3Bucket(resolved.stage, resolved.spec);
}

export async function healthS3Resource(
  resource: Resource,
  context: ProviderContext,
) {
  if (resource.kind === "static_site") {
    validateS3StaticSite(resource, context);
    return healthS3StaticSite(resource, context);
  }

  const resolved = storageTarget(resource, context);
  const exists = await s3BucketExists(resolved.stage, resolved.spec);

  if (!exists) {
    return {
      healthy: false,
      message: "S3 bucket does not exist",
    };
  }

  const [region, publicBlocked] = await Promise.all([
    getS3BucketRegion(resolved.stage, resolved.spec),
    getS3PublicAccessBlocked(resolved.stage, resolved.spec),
  ]);

  if (region !== resolved.spec.region) {
    return {
      healthy: false,
      message: `S3 bucket is in ${region ?? "an unknown region"}, expected ${resolved.spec.region}`,
    };
  }

  const expectBlocked = resolved.spec.public !== true;

  if (publicBlocked !== null && publicBlocked !== expectBlocked) {
    return {
      healthy: false,
      message: expectBlocked
        ? "S3 public access is not fully blocked"
        : "S3 public access block does not match desired state",
    };
  }

  return {
    healthy: true,
    message: `S3 bucket exists in ${region} and matches desired access state`,
  };
}
