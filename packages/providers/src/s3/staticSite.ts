import fs from "node:fs/promises";
import path from "node:path";

import {
  disableGateHouseDistribution,
  ensureGateHouseDistribution,
  findGateHouseDistribution,
  getAcmCertificateState,
  grantCloudFrontReadAccess,
  invalidateCloudFrontDistribution,
  removeS3Deployment,
  s3DeploymentManifestExists,
  syncS3Deployment,
  type CloudFrontStaticSiteSpec,
  type S3BucketSpec,
  type S3SyncObject,
} from "@gatehouse/aws";
import { ROOT_DIR } from "@gatehouse/runtime";
import type {
  AwsAcmCertificateSpec,
  CertificateResource,
  Resource,
  StaticSiteResource,
  StorageBucketResource,
} from "@gatehouse/types";
import type { ProviderContext } from "../types";

function resolveBuildDirectory(value: string): string {
  return path.isAbsolute(value)
    ? path.normalize(value)
    : path.resolve(ROOT_DIR, value);
}

function normalizePrefix(value?: string): string {
  if (!value) return "";

  const cleaned = value
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");

  return cleaned ? `${cleaned}/` : "";
}

function contentType(filename: string): string | undefined {
  switch (path.extname(filename).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".ico":
      return "image/x-icon";
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".xml":
      return "application/xml; charset=utf-8";
    case ".pdf":
      return "application/pdf";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return undefined;
  }
}

function cacheControl(filename: string): string {
  const base = path.basename(filename);

  if (
    base === "index.html" ||
    base.endsWith(".html") ||
    base === "service-worker.js" ||
    base === "sw.js"
  ) {
    return "no-cache";
  }

  if (/\.[a-f0-9]{8,}\./i.test(base)) {
    return "public, max-age=31536000, immutable";
  }

  return "public, max-age=3600";
}

async function collectFiles(directory: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(current: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const absolute = path.join(current, entry.name);

      if (entry.isDirectory()) {
        await walk(absolute);
        continue;
      }

      if (entry.isFile()) {
        files.push(absolute);
      }
    }
  }

  await walk(directory);
  return files.sort();
}

function requireSameStageDependency(
  dependencyId: string,
  dependencyName: string,
  context: ProviderContext,
): void {
  const targetStage = context.projectStages[0]?.stage;
  const stages = context.dependencyStages[dependencyId] ?? [];

  if (!targetStage || stages.length !== 1) {
    throw new Error(
      `Dependency "${dependencyName}" must belong to exactly one project stage`,
    );
  }

  if (stages[0].stage.id !== targetStage.id) {
    throw new Error(
      `Dependency "${dependencyName}" must belong to the same project stage as the static site`,
    );
  }
}

function storageDependency(
  resource: StaticSiteResource,
  context: ProviderContext,
): StorageBucketResource {
  const dependency = context.dependencies.find(
    (candidate) =>
      candidate.id === resource.spec.storageId &&
      candidate.kind === "storage_bucket",
  );

  if (!dependency || dependency.kind !== "storage_bucket") {
    throw new Error(
      `Static site "${resource.name}" requires its configured storage dependency`,
    );
  }

  if (dependency.spec.provider !== "s3") {
    throw new Error(
      `Static site "${resource.name}" requires an S3 storage dependency`,
    );
  }

  requireSameStageDependency(
    dependency.id,
    dependency.name,
    context,
  );

  return dependency;
}

function bucketSpec(storage: StorageBucketResource): S3BucketSpec {
  if (storage.spec.provider !== "s3") {
    throw new Error("Expected S3 storage dependency");
  }

  return {
    bucket: storage.spec.bucket,
    region: storage.spec.region,
    public: storage.spec.public,
  };
}

type AwsAcmCertificateResource = CertificateResource & {
  spec: AwsAcmCertificateSpec;
};

function isAwsAcmCertificate(
  resource: Resource,
): resource is AwsAcmCertificateResource {
  return (
    resource.kind === "certificate" &&
    resource.spec.provider === "aws_acm"
  );
}

function certificateDependency(
  resource: StaticSiteResource,
  context: ProviderContext,
): AwsAcmCertificateResource | null {
  const certificateId = resource.spec.cloudFront?.certificateId;

  if (!certificateId) {
    return null;
  }

  const dependency = context.dependencies.find(
    (candidate) =>
      candidate.id === certificateId &&
      candidate.kind === "certificate",
  );

  if (!dependency) {
    throw new Error(
      `Static site "${resource.name}" requires its configured certificate dependency`,
    );
  }

  if (!isAwsAcmCertificate(dependency)) {
    throw new Error(
      `Static site "${resource.name}" requires an AWS ACM certificate`,
    );
  }

  requireSameStageDependency(
    dependency.id,
    dependency.name,
    context,
  );

  return dependency;
}

async function cloudFrontSpec(
  resource: StaticSiteResource,
  storage: StorageBucketResource,
  context: ProviderContext,
): Promise<CloudFrontStaticSiteSpec> {
  if (storage.spec.provider !== "s3") {
    throw new Error("Expected S3 storage dependency");
  }

  const aliases = resource.spec.cloudFront?.aliases ?? [];
  const certificate = certificateDependency(resource, context);
  let certificateArn: string | undefined;

  if (aliases.length) {
    if (!certificate) {
      throw new Error(
        `Static site "${resource.name}" requires an ACM certificate for custom CloudFront aliases`,
      );
    }

    const region = certificate.spec.region ?? "us-east-1";

    if (region !== "us-east-1") {
      throw new Error(
        `CloudFront certificate "${certificate.name}" must be in us-east-1`,
      );
    }

    const targetStage = stage(context);
    const state = await getAcmCertificateState(
      targetStage,
      {
        resourceId: certificate.id,
        domains: certificate.spec.domains,
        wildcard: certificate.spec.wildcard,
        region,
        certificateArn: certificate.spec.certificateArn,
        validation: certificate.spec.validation ?? "dns",
      },
    );

    if (!state) {
      throw new Error(
        `ACM certificate "${certificate.name}" does not exist`,
      );
    }

    if (state.status !== "ISSUED") {
      throw new Error(
        `ACM certificate "${certificate.name}" is ${state.status ?? "not issued"}`,
      );
    }

    certificateArn = state.arn;
  }

  if (
    resource.spec.cloudFront?.distributionId &&
    (aliases.length || certificateArn)
  ) {
    throw new Error(
      "GateHouse does not modify aliases or certificates on adopted CloudFront distributions",
    );
  }

  return {
    resourceId: resource.id,
    bucket: storage.spec.bucket,
    bucketRegion: storage.spec.region,
    prefix: resource.spec.prefix,
    distributionId: resource.spec.cloudFront?.distributionId,
    defaultRootObject:
      resource.spec.cloudFront?.defaultRootObject ?? "index.html",
    aliases,
    certificateArn,
  };
}

function stage(context: ProviderContext) {
  const resolved = context.projectStages[0]?.stage;

  if (!resolved) {
    throw new Error(
      "S3 static-site deployment requires an attached project stage",
    );
  }

  return resolved;
}

export function validateS3StaticSite(
  resource: Resource,
  context: ProviderContext,
): asserts resource is StaticSiteResource {
  if (resource.kind !== "static_site") {
    throw new Error(
      `S3 static-site provider cannot manage resource kind "${resource.kind}"`,
    );
  }

  if (context.projectStages.length !== 1) {
    throw new Error(
      `S3 static site "${resource.name}" must be attached to exactly one project stage`,
    );
  }

  if (!resource.spec.buildDirectory.trim()) {
    throw new Error("Static site build directory is required");
  }

  if (!resource.spec.storageId) {
    throw new Error("S3 static site requires a storage dependency");
  }

  storageDependency(resource, context);
}

async function deploymentObjects(
  resource: StaticSiteResource,
): Promise<S3SyncObject[]> {
  const root = resolveBuildDirectory(resource.spec.buildDirectory);
  const stat = await fs.stat(root);

  if (!stat.isDirectory()) {
    throw new Error(
      `Static site build path is not a directory: ${root}`,
    );
  }

  const prefix = normalizePrefix(resource.spec.prefix);
  const files = await collectFiles(root);

  return Promise.all(
    files.map(async (filename) => {
      const relative = path
        .relative(root, filename)
        .split(path.sep)
        .join("/");

      return {
        key: `${prefix}${relative}`,
        body: new Uint8Array(await fs.readFile(filename)),
        contentType: contentType(filename),
        cacheControl: cacheControl(filename),
      };
    }),
  );
}

export async function reconcileS3StaticSite(
  resource: StaticSiteResource,
  context: ProviderContext,
): Promise<void> {
  const storage = storageDependency(resource, context);
  const targetStage = stage(context);
  const targetBucket = bucketSpec(storage);
  const objects = await deploymentObjects(resource);

  if (resource.spec.cloudFront?.enabled) {
    const distribution = await ensureGateHouseDistribution(
      targetStage,
      await cloudFrontSpec(resource, storage, context),
    );

    await grantCloudFrontReadAccess(
      targetStage,
      targetBucket,
      resource.id,
      distribution.id,
      resource.spec.prefix,
    );
  }

  await syncS3Deployment(
    targetStage,
    targetBucket,
    resource.id,
    objects,
  );

  if (resource.spec.cloudFront?.enabled) {
    const distribution = await findGateHouseDistribution(
      targetStage,
      await cloudFrontSpec(resource, storage, context),
    );

    if (!distribution) {
      throw new Error("CloudFront distribution could not be resolved after deployment");
    }

    await invalidateCloudFrontDistribution(
      targetStage,
      distribution.id,
      resource.id,
    );
  }
}

export async function destroyS3StaticSite(
  resource: StaticSiteResource,
  context: ProviderContext,
): Promise<void> {
  const storage = storageDependency(resource, context);
  const targetStage = stage(context);

  if (resource.spec.cloudFront?.enabled) {
    await disableGateHouseDistribution(
      targetStage,
      await cloudFrontSpec(resource, storage, context),
    );
  }

  await removeS3Deployment(
    targetStage,
    bucketSpec(storage),
    resource.id,
  );
}

export async function healthS3StaticSite(
  resource: StaticSiteResource,
  context: ProviderContext,
) {
  const storage = storageDependency(resource, context);
  const targetStage = stage(context);
  const exists = await s3DeploymentManifestExists(
    targetStage,
    bucketSpec(storage),
    resource.id,
  );

  if (!exists) {
    return {
      healthy: false,
      message: "S3 static-site deployment manifest is missing",
    };
  }

  if (!resource.spec.cloudFront?.enabled) {
    return {
      healthy: true,
      message: "S3 static-site deployment manifest exists",
    };
  }

  const distribution = await findGateHouseDistribution(
    targetStage,
    await cloudFrontSpec(resource, storage, context),
  );

  if (!distribution) {
    return {
      healthy: false,
      message: "CloudFront distribution does not exist",
    };
  }

  if (!distribution.enabled) {
    return {
      healthy: false,
      message: "CloudFront distribution is disabled",
    };
  }

  return {
    healthy: distribution.status === "Deployed",
    message:
      distribution.status === "Deployed"
        ? `CloudFront is deployed at ${distribution.domainName ?? distribution.id}`
        : `CloudFront distribution status is ${distribution.status ?? "unknown"}`,
  };
}
