import type { BaseResource } from "../core/resource";

export type StorageProvider = "local" | "s3";

export interface LocalStorageSpec {
  provider: "local";

  path: string;
}

export interface S3StorageSpec {
  provider: "s3";

  bucket: string;

  region: string;

  public?: boolean;
}

export type StorageBucketSpec = LocalStorageSpec | S3StorageSpec;

export type StorageBucketResource = BaseResource<
  "storage_bucket",
  StorageBucketSpec
>;
