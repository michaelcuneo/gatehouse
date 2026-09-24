import {
  ensureRoute53CloudFrontAliases as ensureAwsCloudFrontAliases,
  findGateHouseDistribution,
  findRoute53Record as findAwsRoute53Record,
  removeRoute53CloudFrontAliases as removeAwsCloudFrontAliases,
  removeRoute53Record as removeAwsRoute53Record,
  route53CloudFrontAliasesHealthy as awsCloudFrontAliasesHealthy,
  route53RecordMatchesDesired as awsRoute53RecordMatchesDesired,
  upsertRoute53Record as upsertAwsRoute53Record,
} from "@gatehouse/aws";
import type { ManagedStage } from "@gatehouse/core";
import type {
  DNSRecordResource,
  StaticSiteResource,
} from "@gatehouse/types";
import type { ProviderContext } from "../types";

function valueRecord(resource: DNSRecordResource) {
  if (resource.spec.mode === "cloudfront_alias") {
    throw new Error("Expected value DNS record");
  }

  return {
    zone: resource.spec.zone,
    name: resource.spec.name,
    type: resource.spec.type,
    value: resource.spec.value,
    ttl: resource.spec.ttl ?? 300,
  };
}

function staticSiteDependency(
  resource: DNSRecordResource,
  context: ProviderContext,
): StaticSiteResource {
  if (resource.spec.mode !== "cloudfront_alias") {
    throw new Error("Expected CloudFront alias DNS record");
  }

  const dependency = context.dependencies.find(
    (candidate) => candidate.id === resource.spec.staticSiteId,
  );

  if (!dependency || dependency.kind !== "static_site") {
    throw new Error(
      `CloudFront alias "${resource.name}" requires its static-site dependency`,
    );
  }

  return dependency;
}

async function cloudFrontTarget(
  resource: DNSRecordResource,
  stage: ManagedStage,
  context: ProviderContext,
) {
  const site = staticSiteDependency(resource, context);

  if (!site.spec.cloudFront?.enabled) {
    throw new Error(
      `Static site "${site.name}" does not have CloudFront enabled`,
    );
  }

  if (!site.spec.storageId) {
    throw new Error(
      `Static site "${site.name}" has no S3 storage dependency`,
    );
  }

  const storage = context.dependencies.find(
    (candidate) => candidate.id === site.spec.storageId,
  );

  if (
    !storage ||
    storage.kind !== "storage_bucket" ||
    storage.spec.provider !== "s3"
  ) {
    throw new Error(
      `Static site "${site.name}" requires its S3 storage dependency`,
    );
  }

  const distribution = await findGateHouseDistribution(stage, {
    resourceId: site.id,
    bucket: storage.spec.bucket,
    bucketRegion: storage.spec.region,
    prefix: site.spec.prefix,
    distributionId: site.spec.cloudFront.distributionId,
    defaultRootObject: site.spec.cloudFront.defaultRootObject ?? "index.html",
    aliases: site.spec.cloudFront.aliases,
  });

  if (!distribution?.domainName) {
    throw new Error(
      `CloudFront distribution for static site "${site.name}" is not available`,
    );
  }

  return distribution.domainName;
}

export async function upsertRoute53Record(
  resource: DNSRecordResource,
  stage: ManagedStage,
  context: ProviderContext,
): Promise<void> {
  if (resource.spec.mode === "cloudfront_alias") {
    const domain = await cloudFrontTarget(resource, stage, context);

    await ensureAwsCloudFrontAliases(
      stage,
      resource.spec.zone,
      resource.spec.name,
      domain,
    );

    return;
  }

  await upsertAwsRoute53Record(
    stage,
    valueRecord(resource),
    `Managed by GateHouse resource ${resource.id}`,
  );
}

export async function removeRoute53Record(
  resource: DNSRecordResource,
  stage: ManagedStage,
  context: ProviderContext,
): Promise<void> {
  if (resource.spec.mode === "cloudfront_alias") {
    const domain = await cloudFrontTarget(resource, stage, context);

    await removeAwsCloudFrontAliases(
      stage,
      resource.spec.zone,
      resource.spec.name,
      domain,
    );

    return;
  }

  await removeAwsRoute53Record(
    stage,
    valueRecord(resource),
    `Removed by GateHouse resource ${resource.id}`,
  );
}

export async function findRoute53Record(
  resource: DNSRecordResource,
  stage: ManagedStage,
) {
  if (resource.spec.mode === "cloudfront_alias") {
    return null;
  }

  return findAwsRoute53Record(stage, valueRecord(resource));
}

export async function route53RecordMatchesDesired(
  resource: DNSRecordResource,
  stage: ManagedStage,
  context: ProviderContext,
): Promise<boolean> {
  if (resource.spec.mode === "cloudfront_alias") {
    const domain = await cloudFrontTarget(resource, stage, context);

    return awsCloudFrontAliasesHealthy(
      stage,
      resource.spec.zone,
      resource.spec.name,
      domain,
    );
  }

  const existing = await findAwsRoute53Record(
    stage,
    valueRecord(resource),
  );

  return existing
    ? awsRoute53RecordMatchesDesired(
        existing,
        valueRecord(resource),
      )
    : false;
}
