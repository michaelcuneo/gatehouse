import {
  CreateDistributionCommand,
  CreateInvalidationCommand,
  CreateOriginAccessControlCommand,
  GetDistributionCommand,
  GetDistributionConfigCommand,
  ListDistributionsCommand,
  ListOriginAccessControlsCommand,
  UpdateDistributionCommand,
} from "@aws-sdk/client-cloudfront";

import type { ManagedStage } from "@gatehouse/core";

import { awsClientsForStage } from "./clients";

export interface CloudFrontStaticSiteSpec {
  resourceId: string;
  bucket: string;
  bucketRegion: string;
  prefix?: string;
  distributionId?: string;
  defaultRootObject?: string;
}

export interface CloudFrontDistributionState {
  id: string;
  domainName?: string;
  status?: string;
  enabled: boolean;
}

function callerReference(resourceId: string): string {
  return `gatehouse-static-site-${resourceId}`;
}

function originId(resourceId: string): string {
  return `gatehouse-s3-${resourceId}`;
}

function originAccessControlName(resourceId: string): string {
  return `gatehouse-${resourceId}`.slice(0, 64);
}

async function findOriginAccessControl(
  stage: ManagedStage,
  resourceId: string,
): Promise<string | null> {
  const cloudFront = awsClientsForStage(stage).cloudFront;
  let marker: string | undefined;

  do {
    const result = await cloudFront.send(
      new ListOriginAccessControlsCommand({
        Marker: marker,
      }),
    );

    const match = result.OriginAccessControlList?.Items?.find(
      (item) => item.Name === originAccessControlName(resourceId),
    );

    if (match?.Id) {
      return match.Id;
    }

    marker = result.OriginAccessControlList?.IsTruncated
      ? result.OriginAccessControlList.NextMarker
      : undefined;
  } while (marker);

  return null;
}

async function ensureOriginAccessControl(
  stage: ManagedStage,
  resourceId: string,
): Promise<string> {
  const existing = await findOriginAccessControl(stage, resourceId);

  if (existing) {
    return existing;
  }

  const cloudFront = awsClientsForStage(stage).cloudFront;

  const result = await cloudFront.send(
    new CreateOriginAccessControlCommand({
      OriginAccessControlConfig: {
        Name: originAccessControlName(resourceId),
        Description: `GateHouse static site ${resourceId}`,
        OriginAccessControlOriginType: "s3",
        SigningBehavior: "always",
        SigningProtocol: "sigv4",
      },
    }),
  );

  const id = result.OriginAccessControl?.Id;

  if (!id) {
    throw new Error("CloudFront did not return an origin access control id");
  }

  return id;
}

function s3OriginDomain(bucket: string, region: string): string {
  return region === "us-east-1"
    ? `${bucket}.s3.amazonaws.com`
    : `${bucket}.s3.${region}.amazonaws.com`;
}

function originPath(prefix?: string): string {
  if (!prefix?.trim()) return "";

  const cleaned = prefix.trim().replace(/^\/+|\/+$/g, "");
  return cleaned ? `/${cleaned}` : "";
}

export async function findGateHouseDistribution(
  stage: ManagedStage,
  spec: CloudFrontStaticSiteSpec,
): Promise<CloudFrontDistributionState | null> {
  const cloudFront = awsClientsForStage(stage).cloudFront;

  if (spec.distributionId) {
    try {
      const result = await cloudFront.send(
        new GetDistributionCommand({
          Id: spec.distributionId,
        }),
      );

      return result.Distribution
        ? {
            id: result.Distribution.Id ?? spec.distributionId,
            domainName: result.Distribution.DomainName,
            status: result.Distribution.Status,
            enabled:
              result.Distribution.DistributionConfig?.Enabled ?? false,
          }
        : null;
    } catch (cause) {
      const name =
        cause && typeof cause === "object" && "name" in cause
          ? String((cause as { name?: unknown }).name)
          : "";

      if (name === "NoSuchDistribution") {
        return null;
      }

      throw cause;
    }
  }

  let marker: string | undefined;

  do {
    const result = await cloudFront.send(
      new ListDistributionsCommand({
        Marker: marker,
      }),
    );

    const match = result.DistributionList?.Items?.find(
      (distribution) =>
        distribution.DistributionConfig?.CallerReference ===
        callerReference(spec.resourceId),
    );

    if (match?.Id) {
      return {
        id: match.Id,
        domainName: match.DomainName,
        status: match.Status,
        enabled: match.DistributionConfig?.Enabled ?? false,
      };
    }

    marker = result.DistributionList?.IsTruncated
      ? result.DistributionList.NextMarker
      : undefined;
  } while (marker);

  return null;
}

export async function ensureGateHouseDistribution(
  stage: ManagedStage,
  spec: CloudFrontStaticSiteSpec,
): Promise<CloudFrontDistributionState> {
  const existing = await findGateHouseDistribution(stage, spec);

  if (existing) {
    if (!spec.distributionId && !existing.enabled) {
      const cloudFront = awsClientsForStage(stage).cloudFront;
      const current = await cloudFront.send(
        new GetDistributionConfigCommand({
          Id: existing.id,
        }),
      );

      if (!current.DistributionConfig || !current.ETag) {
        throw new Error(
          `CloudFront distribution "${existing.id}" has no editable configuration`,
        );
      }

      const updated = await cloudFront.send(
        new UpdateDistributionCommand({
          Id: existing.id,
          IfMatch: current.ETag,
          DistributionConfig: {
            ...current.DistributionConfig,
            Enabled: true,
          },
        }),
      );

      return {
        id: existing.id,
        domainName: updated.Distribution?.DomainName ?? existing.domainName,
        status: updated.Distribution?.Status ?? existing.status,
        enabled: true,
      };
    }

    return existing;
  }

  if (spec.distributionId) {
    throw new Error(
      `CloudFront distribution "${spec.distributionId}" does not exist`,
    );
  }

  const cloudFront = awsClientsForStage(stage).cloudFront;
  const originAccessControlId = await ensureOriginAccessControl(
    stage,
    spec.resourceId,
  );

  const result = await cloudFront.send(
    new CreateDistributionCommand({
      DistributionConfig: {
        CallerReference: callerReference(spec.resourceId),
        Comment: `Managed by GateHouse static site ${spec.resourceId}`,
        Enabled: true,
        DefaultRootObject: spec.defaultRootObject ?? "index.html",
        Origins: {
          Quantity: 1,
          Items: [
            {
              Id: originId(spec.resourceId),
              DomainName: s3OriginDomain(
                spec.bucket,
                spec.bucketRegion,
              ),
              OriginPath: originPath(spec.prefix),
              OriginAccessControlId: originAccessControlId,
              S3OriginConfig: {
                OriginAccessIdentity: "",
              },
            },
          ],
        },
        DefaultCacheBehavior: {
          TargetOriginId: originId(spec.resourceId),
          ViewerProtocolPolicy: "redirect-to-https",
          Compress: true,
          AllowedMethods: {
            Quantity: 2,
            Items: ["GET", "HEAD"],
            CachedMethods: {
              Quantity: 2,
              Items: ["GET", "HEAD"],
            },
          },
          ForwardedValues: {
            QueryString: false,
            Cookies: {
              Forward: "none",
            },
          },
          MinTTL: 0,
          DefaultTTL: 3600,
          MaxTTL: 31536000,
        },
        PriceClass: "PriceClass_100",
        ViewerCertificate: {
          CloudFrontDefaultCertificate: true,
        },
        HttpVersion: "http2",
        IsIPV6Enabled: true,
        Restrictions: {
          GeoRestriction: {
            RestrictionType: "none",
            Quantity: 0,
          },
        },
      },
    }),
  );

  const distribution = result.Distribution;

  if (!distribution?.Id) {
    throw new Error("CloudFront did not return a distribution id");
  }

  return {
    id: distribution.Id,
    domainName: distribution.DomainName,
    status: distribution.Status,
    enabled: distribution.DistributionConfig?.Enabled ?? true,
  };
}

export async function invalidateCloudFrontDistribution(
  stage: ManagedStage,
  distributionId: string,
  resourceId: string,
): Promise<void> {
  const cloudFront = awsClientsForStage(stage).cloudFront;

  await cloudFront.send(
    new CreateInvalidationCommand({
      DistributionId: distributionId,
      InvalidationBatch: {
        CallerReference: `${resourceId}-${Date.now()}`,
        Paths: {
          Quantity: 1,
          Items: ["/*"],
        },
      },
    }),
  );
}

export async function disableGateHouseDistribution(
  stage: ManagedStage,
  spec: CloudFrontStaticSiteSpec,
): Promise<void> {
  if (spec.distributionId) {
    return;
  }

  const existing = await findGateHouseDistribution(stage, spec);

  if (!existing || !existing.enabled) {
    return;
  }

  const cloudFront = awsClientsForStage(stage).cloudFront;
  const current = await cloudFront.send(
    new GetDistributionConfigCommand({
      Id: existing.id,
    }),
  );

  if (!current.DistributionConfig || !current.ETag) {
    throw new Error(
      `CloudFront distribution "${existing.id}" has no editable configuration`,
    );
  }

  await cloudFront.send(
    new UpdateDistributionCommand({
      Id: existing.id,
      IfMatch: current.ETag,
      DistributionConfig: {
        ...current.DistributionConfig,
        Enabled: false,
      },
    }),
  );
}
