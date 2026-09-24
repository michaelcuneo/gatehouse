import {
  CreateBucketCommand,
  DeleteBucketCommand,
  GetBucketLocationCommand,
  GetPublicAccessBlockCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  PutPublicAccessBlockCommand,
} from "@aws-sdk/client-s3";

import type { ManagedStage } from "@gatehouse/core";

import { awsClientsForStage } from "./clients";

export interface S3BucketSpec {
  bucket: string;
  region: string;
  public?: boolean;
}

function bucketClient(stage: ManagedStage, spec: S3BucketSpec) {
  return awsClientsForStage(stage, spec.region).s3;
}

export async function s3BucketExists(
  stage: ManagedStage,
  spec: S3BucketSpec,
): Promise<boolean> {
  const s3 = bucketClient(stage, spec);

  try {
    await s3.send(new HeadBucketCommand({ Bucket: spec.bucket }));
    return true;
  } catch (cause) {
    const status =
      cause && typeof cause === "object" && "$metadata" in cause
        ? (cause as { $metadata?: { httpStatusCode?: number } }).$metadata
            ?.httpStatusCode
        : undefined;

    if (status === 404) {
      return false;
    }

    throw cause;
  }
}

export async function createS3Bucket(
  stage: ManagedStage,
  spec: S3BucketSpec,
): Promise<void> {
  const s3 = bucketClient(stage, spec);

  await s3.send(
    new CreateBucketCommand({
      Bucket: spec.bucket,
      CreateBucketConfiguration:
        spec.region === "us-east-1"
          ? undefined
          : {
              LocationConstraint: spec.region as never,
            },
    }),
  );
}

export async function configureS3PublicAccess(
  stage: ManagedStage,
  spec: S3BucketSpec,
): Promise<void> {
  const s3 = bucketClient(stage, spec);
  const blockPublic = spec.public !== true;

  await s3.send(
    new PutPublicAccessBlockCommand({
      Bucket: spec.bucket,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: blockPublic,
        IgnorePublicAcls: blockPublic,
        BlockPublicPolicy: blockPublic,
        RestrictPublicBuckets: blockPublic,
      },
    }),
  );
}

export async function reconcileS3Bucket(
  stage: ManagedStage,
  spec: S3BucketSpec,
): Promise<void> {
  const exists = await s3BucketExists(stage, spec);

  if (!exists) {
    await createS3Bucket(stage, spec);
  }

  await configureS3PublicAccess(stage, spec);
}

export async function getS3BucketRegion(
  stage: ManagedStage,
  spec: S3BucketSpec,
): Promise<string | null> {
  const s3 = bucketClient(stage, spec);

  const result = await s3.send(
    new GetBucketLocationCommand({
      Bucket: spec.bucket,
    }),
  );

  const location = result.LocationConstraint;

  if (!location) {
    return "us-east-1";
  }

  if (location === "EU") {
    return "eu-west-1";
  }

  return location;
}

export async function getS3PublicAccessBlocked(
  stage: ManagedStage,
  spec: S3BucketSpec,
): Promise<boolean | null> {
  const s3 = bucketClient(stage, spec);

  try {
    const result = await s3.send(
      new GetPublicAccessBlockCommand({
        Bucket: spec.bucket,
      }),
    );

    const config = result.PublicAccessBlockConfiguration;

    return Boolean(
      config?.BlockPublicAcls &&
        config.IgnorePublicAcls &&
        config.BlockPublicPolicy &&
        config.RestrictPublicBuckets,
    );
  } catch (cause) {
    const name =
      cause && typeof cause === "object" && "name" in cause
        ? String((cause as { name?: unknown }).name)
        : "";

    if (name === "NoSuchPublicAccessBlockConfiguration") {
      return false;
    }

    throw cause;
  }
}

export async function s3BucketIsEmpty(
  stage: ManagedStage,
  spec: S3BucketSpec,
): Promise<boolean> {
  const s3 = bucketClient(stage, spec);

  const result = await s3.send(
    new ListObjectsV2Command({
      Bucket: spec.bucket,
      MaxKeys: 1,
    }),
  );

  return (result.KeyCount ?? result.Contents?.length ?? 0) === 0;
}

export async function deleteEmptyS3Bucket(
  stage: ManagedStage,
  spec: S3BucketSpec,
): Promise<void> {
  const exists = await s3BucketExists(stage, spec);

  if (!exists) {
    return;
  }

  const empty = await s3BucketIsEmpty(stage, spec);

  if (!empty) {
    throw new Error(
      `Refusing to delete non-empty S3 bucket "${spec.bucket}"`,
    );
  }

  const s3 = bucketClient(stage, spec);

  await s3.send(
    new DeleteBucketCommand({
      Bucket: spec.bucket,
    }),
  );
}


export interface S3SyncObject {
  key: string;
  body: Uint8Array;
  contentType?: string;
  cacheControl?: string;
}

interface S3DeploymentManifest {
  version: 1;
  resourceId: string;
  keys: string[];
}

function manifestKey(resourceId: string): string {
  return `.gatehouse/manifests/static-sites/${resourceId}.json`;
}

async function readDeploymentManifest(
  stage: ManagedStage,
  spec: S3BucketSpec,
  resourceId: string,
): Promise<S3DeploymentManifest | null> {
  const s3 = bucketClient(stage, spec);

  try {
    const result = await s3.send(
      new GetObjectCommand({
        Bucket: spec.bucket,
        Key: manifestKey(resourceId),
      }),
    );

    const content = await result.Body?.transformToString();

    if (!content) return null;

    const parsed = JSON.parse(content) as S3DeploymentManifest;

    if (
      parsed.version !== 1 ||
      parsed.resourceId !== resourceId ||
      !Array.isArray(parsed.keys)
    ) {
      throw new Error("Invalid GateHouse static-site manifest");
    }

    return parsed;
  } catch (cause) {
    const status =
      cause && typeof cause === "object" && "$metadata" in cause
        ? (cause as { $metadata?: { httpStatusCode?: number } }).$metadata
            ?.httpStatusCode
        : undefined;

    const name =
      cause && typeof cause === "object" && "name" in cause
        ? String((cause as { name?: unknown }).name)
        : "";

    if (status === 404 || name === "NoSuchKey") {
      return null;
    }

    throw cause;
  }
}

async function writeDeploymentManifest(
  stage: ManagedStage,
  spec: S3BucketSpec,
  resourceId: string,
  keys: string[],
): Promise<void> {
  const s3 = bucketClient(stage, spec);
  const manifest: S3DeploymentManifest = {
    version: 1,
    resourceId,
    keys: [...keys].sort(),
  };

  await s3.send(
    new PutObjectCommand({
      Bucket: spec.bucket,
      Key: manifestKey(resourceId),
      Body: JSON.stringify(manifest, null, 2),
      ContentType: "application/json",
      CacheControl: "no-store",
    }),
  );
}

export async function syncS3Deployment(
  stage: ManagedStage,
  spec: S3BucketSpec,
  resourceId: string,
  objects: S3SyncObject[],
): Promise<{ uploaded: number; deleted: number }> {
  const s3 = bucketClient(stage, spec);
  const previous = await readDeploymentManifest(stage, spec, resourceId);
  const nextKeys = new Set(objects.map((object) => object.key));

  for (const object of objects) {
    await s3.send(
      new PutObjectCommand({
        Bucket: spec.bucket,
        Key: object.key,
        Body: object.body,
        ContentType: object.contentType,
        CacheControl: object.cacheControl,
      }),
    );
  }

  const stale = (previous?.keys ?? []).filter((key) => !nextKeys.has(key));

  for (let offset = 0; offset < stale.length; offset += 1000) {
    const batch = stale.slice(offset, offset + 1000);

    if (!batch.length) continue;

    await s3.send(
      new DeleteObjectsCommand({
        Bucket: spec.bucket,
        Delete: {
          Quiet: true,
          Objects: batch.map((Key) => ({ Key })),
        },
      }),
    );
  }

  await writeDeploymentManifest(
    stage,
    spec,
    resourceId,
    [...nextKeys],
  );

  return {
    uploaded: objects.length,
    deleted: stale.length,
  };
}

export async function removeS3Deployment(
  stage: ManagedStage,
  spec: S3BucketSpec,
  resourceId: string,
): Promise<number> {
  const s3 = bucketClient(stage, spec);
  const manifest = await readDeploymentManifest(stage, spec, resourceId);
  const keys = manifest?.keys ?? [];

  for (let offset = 0; offset < keys.length; offset += 1000) {
    const batch = keys.slice(offset, offset + 1000);

    if (!batch.length) continue;

    await s3.send(
      new DeleteObjectsCommand({
        Bucket: spec.bucket,
        Delete: {
          Quiet: true,
          Objects: batch.map((Key) => ({ Key })),
        },
      }),
    );
  }

  await s3.send(
    new DeleteObjectsCommand({
      Bucket: spec.bucket,
      Delete: {
        Quiet: true,
        Objects: [{ Key: manifestKey(resourceId) }],
      },
    }),
  );

  return keys.length;
}

export async function s3DeploymentManifestExists(
  stage: ManagedStage,
  spec: S3BucketSpec,
  resourceId: string,
): Promise<boolean> {
  return (await readDeploymentManifest(stage, spec, resourceId)) !== null;
}
