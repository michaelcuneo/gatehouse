import {
  CreateBucketCommand,
  DeleteBucketCommand,
  GetBucketLocationCommand,
  GetPublicAccessBlockCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
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
