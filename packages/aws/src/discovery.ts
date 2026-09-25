import {
  DescribeStacksCommand,
  ListStackResourcesCommand,
  ListStacksCommand,
} from "@aws-sdk/client-cloudformation";
import {
  GetBucketLocationCommand,
  GetPublicAccessBlockCommand,
  ListBucketsCommand,
} from "@aws-sdk/client-s3";
import {
  ListHostedZonesCommand,
  ListResourceRecordSetsCommand,
} from "@aws-sdk/client-route-53";
import {
  DescribeCertificateCommand,
  ListCertificatesCommand,
} from "@aws-sdk/client-acm";
import { ListDistributionsCommand } from "@aws-sdk/client-cloudfront";
import { ListFunctionsCommand } from "@aws-sdk/client-lambda";
import {
  DescribeTableCommand,
  ListTablesCommand,
} from "@aws-sdk/client-dynamodb";

import type { ManagedStage } from "@gatehouse/core";

import { assertAwsStageAccess } from "./access";
import { awsClientsForStage } from "./clients";

export type AwsDiscoveredOwnershipMode = "observed" | "external";

export interface AwsDiscoveredOwner {
  type: "cloudformation" | "sst" | "cdk";
  id: string;
  name: string;
  logicalId?: string;
}

export interface AwsDiscoveredResource {
  id: string;
  service:
    | "cloudformation"
    | "s3"
    | "route53"
    | "acm"
    | "cloudfront"
    | "lambda"
    | "dynamodb";
  resourceType: string;
  name: string;
  physicalId: string;
  region: string;
  arn?: string;
  ownership: AwsDiscoveredOwnershipMode;
  owner?: AwsDiscoveredOwner;
  details?: Record<string, string | number | boolean | null>;
}

export interface AwsDiscoveredStack {
  id: string;
  name: string;
  region: string;
  status: string;
  ownerType: "cloudformation" | "sst" | "cdk";
  resourceCount: number;
}

export interface AwsStageDiscovery {
  accountId: string;
  scannedAt: string;
  regions: string[];
  stacks: AwsDiscoveredStack[];
  resources: AwsDiscoveredResource[];
  warnings: string[];
}

type StackOwnershipIndexEntry = AwsDiscoveredOwner & {
  resourceType: string;
};

function uniqueRegions(stage: ManagedStage): string[] {
  return [
    ...new Set([
      stage.primaryRegion,
      ...(stage.additionalRegions ?? []),
    ]),
  ].filter(Boolean);
}

function normalisePhysicalId(value: string): string[] {
  const trimmed = value.trim();
  const candidates = [
    trimmed,
    ...trimmed.split("|").map((part) => part.trim()).filter(Boolean),
  ];

  return [
    ...new Set(
      candidates.flatMap((candidate) => [
        candidate,
        candidate.replace(/\.$/, ""),
        candidate.toLowerCase(),
        candidate.replace(/\.$/, "").toLowerCase(),
      ]),
    ),
  ];
}

function stackOwnerType(
  description: string | undefined,
  tags: { Key?: string; Value?: string }[] | undefined,
): "cloudformation" | "sst" | "cdk" {
  const keys = new Set(
    (tags ?? [])
      .map((tag) => tag.Key?.toLowerCase())
      .filter((key): key is string => Boolean(key)),
  );
  const text = (description ?? "").toLowerCase();

  if (
    [...keys].some((key) => key.startsWith("sst:")) ||
    text.includes("sst")
  ) {
    return "sst";
  }

  if (
    [...keys].some((key) => key.includes("aws-cdk")) ||
    text.includes("aws cdk") ||
    text.includes("cloud development kit")
  ) {
    return "cdk";
  }

  return "cloudformation";
}

async function discoverStacks(
  stage: ManagedStage,
  region: string,
): Promise<{
  stacks: AwsDiscoveredStack[];
  ownership: Map<string, StackOwnershipIndexEntry>;
}> {
  const cloudFormation = awsClientsForStage(stage, region).cloudFormation;
  const summaries = [];
  let nextToken: string | undefined;

  do {
    const result = await cloudFormation.send(
      new ListStacksCommand({
        NextToken: nextToken,
      }),
    );

    for (const stack of result.StackSummaries ?? []) {
      if (
        stack.StackId &&
        stack.StackName &&
        stack.StackStatus !== "DELETE_COMPLETE"
      ) {
        summaries.push(stack);
      }
    }

    nextToken = result.NextToken;
  } while (nextToken);

  const stacks: AwsDiscoveredStack[] = [];
  const ownership = new Map<string, StackOwnershipIndexEntry>();

  for (const summary of summaries) {
    const described = await cloudFormation.send(
      new DescribeStacksCommand({
        StackName: summary.StackId,
      }),
    );
    const stack = described.Stacks?.[0];
    const ownerType = stackOwnerType(stack?.Description, stack?.Tags);
    const stackResources = [];
    let resourceToken: string | undefined;

    do {
      const result = await cloudFormation.send(
        new ListStackResourcesCommand({
          StackName: summary.StackId,
          NextToken: resourceToken,
        }),
      );

      stackResources.push(...(result.StackResourceSummaries ?? []));
      resourceToken = result.NextToken;
    } while (resourceToken);

    stacks.push({
      id: summary.StackId!,
      name: summary.StackName!,
      region,
      status: String(summary.StackStatus ?? "UNKNOWN"),
      ownerType,
      resourceCount: stackResources.length,
    });

    for (const resource of stackResources) {
      const physicalId = resource.PhysicalResourceId;

      if (!physicalId) continue;

      const owner: StackOwnershipIndexEntry = {
        type: ownerType,
        id: summary.StackId!,
        name: summary.StackName!,
        logicalId: resource.LogicalResourceId,
        resourceType: resource.ResourceType ?? "Unknown",
      };

      for (const key of normalisePhysicalId(physicalId)) {
        ownership.set(key, owner);
      }
    }
  }

  return { stacks, ownership };
}

function ownerFor(
  physicalId: string,
  ownership: Map<string, StackOwnershipIndexEntry>,
): AwsDiscoveredOwner | undefined {
  for (const key of normalisePhysicalId(physicalId)) {
    const owner = ownership.get(key);

    if (owner) {
      return {
        type: owner.type,
        id: owner.id,
        name: owner.name,
        logicalId: owner.logicalId,
      };
    }
  }

  return undefined;
}

function discovered(
  input: Omit<AwsDiscoveredResource, "ownership" | "owner">,
  ownership: Map<string, StackOwnershipIndexEntry>,
): AwsDiscoveredResource {
  const owner = ownerFor(input.physicalId, ownership);

  return {
    ...input,
    ownership: owner ? "external" : "observed",
    owner,
  };
}

async function discoverS3(
  stage: ManagedStage,
  ownership: Map<string, StackOwnershipIndexEntry>,
): Promise<AwsDiscoveredResource[]> {
  const { s3 } = awsClientsForStage(stage);
  const result = await s3.send(new ListBucketsCommand({}));
  const resources: AwsDiscoveredResource[] = [];

  for (const bucket of result.Buckets ?? []) {
    if (!bucket.Name) continue;

    const location = await s3.send(
      new GetBucketLocationCommand({
        Bucket: bucket.Name,
      }),
    );
    const region =
      !location.LocationConstraint
        ? "us-east-1"
        : location.LocationConstraint === "EU"
          ? "eu-west-1"
          : String(location.LocationConstraint);

    let publicAccessBlocked: boolean | null = null;

    try {
      const block = await s3.send(
        new GetPublicAccessBlockCommand({
          Bucket: bucket.Name,
        }),
      );
      const config = block.PublicAccessBlockConfiguration;

      publicAccessBlocked = Boolean(
        config?.BlockPublicAcls &&
        config.IgnorePublicAcls &&
        config.BlockPublicPolicy &&
        config.RestrictPublicBuckets,
      );

      resources.push(
        discovered(
          {
            id: `s3:${bucket.Name}`,
            service: "s3",
            resourceType: "AWS::S3::Bucket",
            name: bucket.Name,
            physicalId: bucket.Name,
            region,
            details: {
              createdAt: bucket.CreationDate?.toISOString() ?? null,
              publicAccessBlocked,
              blockPublicAcls: config?.BlockPublicAcls ?? false,
              ignorePublicAcls: config?.IgnorePublicAcls ?? false,
              blockPublicPolicy: config?.BlockPublicPolicy ?? false,
              restrictPublicBuckets: config?.RestrictPublicBuckets ?? false,
            },
          },
          ownership,
        ),
      );

      continue;
    } catch (cause) {
      const name =
        cause && typeof cause === "object" && "name" in cause
          ? String((cause as { name?: unknown }).name)
          : "";

      if (name === "NoSuchPublicAccessBlockConfiguration") {
        publicAccessBlocked = false;
      } else {
        throw cause;
      }
    }

    resources.push(
      discovered(
        {
          id: `s3:${bucket.Name}`,
          service: "s3",
          resourceType: "AWS::S3::Bucket",
          name: bucket.Name,
          physicalId: bucket.Name,
          region,
          details: {
            createdAt: bucket.CreationDate?.toISOString() ?? null,
            publicAccessBlocked,
            blockPublicAcls: false,
            ignorePublicAcls: false,
            blockPublicPolicy: false,
            restrictPublicBuckets: false,
          },
        },
        ownership,
      ),
    );
  }

  return resources;
}

async function discoverRoute53(
  stage: ManagedStage,
  ownership: Map<string, StackOwnershipIndexEntry>,
): Promise<AwsDiscoveredResource[]> {
  const { route53 } = awsClientsForStage(stage);
  const resources: AwsDiscoveredResource[] = [];
  let marker: string | undefined;

  do {
    const zones = await route53.send(
      new ListHostedZonesCommand({
        Marker: marker,
      }),
    );

    for (const zone of zones.HostedZones ?? []) {
      if (!zone.Id || !zone.Name) continue;

      resources.push(
        discovered(
          {
            id: `route53:zone:${zone.Id}`,
            service: "route53",
            resourceType: "AWS::Route53::HostedZone",
            name: zone.Name,
            physicalId: zone.Id,
            region: "global",
            details: {
              privateZone: zone.Config?.PrivateZone ?? false,
            },
          },
          ownership,
        ),
      );

      let recordName: string | undefined;
      let recordType:
        | "SOA"
        | "A"
        | "TXT"
        | "NS"
        | "CNAME"
        | "MX"
        | "NAPTR"
        | "PTR"
        | "SRV"
        | "SPF"
        | "AAAA"
        | "CAA"
        | "DS"
        | "TLSA"
        | "SSHFP"
        | "SVCB"
        | "HTTPS"
        | undefined;
      let recordIdentifier: string | undefined;

      do {
        const records = await route53.send(
          new ListResourceRecordSetsCommand({
            HostedZoneId: zone.Id,
            StartRecordName: recordName,
            StartRecordType: recordType,
            StartRecordIdentifier: recordIdentifier,
          }),
        );

        for (const record of records.ResourceRecordSets ?? []) {
          if (!record.Name || !record.Type) continue;

          const physicalId = record.Name.replace(/\.$/, "");

          resources.push(
            discovered(
              {
                id: `route53:record:${zone.Id}:${record.Type}:${record.Name}`,
                service: "route53",
                resourceType: "AWS::Route53::RecordSet",
                name: record.Name,
                physicalId,
                region: "global",
                details: {
                  zone: zone.Name.replace(/\.$/, ""),
                  type: record.Type,
                  ttl: record.TTL ?? null,
                  alias: Boolean(record.AliasTarget),
                  value:
                    record.ResourceRecords?.length === 1
                      ? record.ResourceRecords[0]?.Value ?? null
                      : null,
                  valueCount: record.ResourceRecords?.length ?? 0,
                  aliasDnsName:
                    record.AliasTarget?.DNSName?.replace(/\.$/, "") ?? null,
                },
              },
              ownership,
            ),
          );
        }

        if (!records.IsTruncated) break;

        recordName = records.NextRecordName;
        recordType = records.NextRecordType;
        recordIdentifier = records.NextRecordIdentifier;
      } while (recordName && recordType);
    }

    marker = zones.IsTruncated ? zones.NextMarker : undefined;
  } while (marker);

  return resources;
}

async function discoverAcm(
  stage: ManagedStage,
  region: string,
  ownership: Map<string, StackOwnershipIndexEntry>,
): Promise<AwsDiscoveredResource[]> {
  const { acm } = awsClientsForStage(stage, region);
  const resources: AwsDiscoveredResource[] = [];
  let nextToken: string | undefined;

  do {
    const result = await acm.send(
      new ListCertificatesCommand({
        NextToken: nextToken,
      }),
    );

    for (const certificate of result.CertificateSummaryList ?? []) {
      if (!certificate.CertificateArn) continue;

      const detail = await acm.send(
        new DescribeCertificateCommand({
          CertificateArn: certificate.CertificateArn,
        }),
      );
      const certificateDetail = detail.Certificate;

      resources.push(
        discovered(
          {
            id: `acm:${certificate.CertificateArn}`,
            service: "acm",
            resourceType: "AWS::CertificateManager::Certificate",
            name:
              certificateDetail?.DomainName ??
              certificate.DomainName ??
              certificate.CertificateArn,
            physicalId: certificate.CertificateArn,
            arn: certificate.CertificateArn,
            region,
            details: {
              status: certificateDetail?.Status ?? null,
              validation:
                certificateDetail?.DomainValidationOptions?.some(
                  (option) => option.ValidationMethod === "EMAIL",
                )
                  ? "email"
                  : "dns",
              domains: JSON.stringify(
                certificateDetail?.SubjectAlternativeNames ??
                [certificateDetail?.DomainName ?? certificate.DomainName]
                  .filter(Boolean),
              ),
              inUseBy: certificateDetail?.InUseBy?.length ?? 0,
            },
          },
          ownership,
        ),
      );
    }

    nextToken = result.NextToken;
  } while (nextToken);

  return resources;
}

async function discoverCloudFront(
  stage: ManagedStage,
  ownership: Map<string, StackOwnershipIndexEntry>,
): Promise<AwsDiscoveredResource[]> {
  const { cloudFront } = awsClientsForStage(stage);
  const resources: AwsDiscoveredResource[] = [];
  let marker: string | undefined;

  do {
    const result = await cloudFront.send(
      new ListDistributionsCommand({
        Marker: marker,
      }),
    );
    const list = result.DistributionList;

    for (const distribution of list?.Items ?? []) {
      if (!distribution.Id) continue;

      const origins = distribution.Origins?.Items ?? [];
      const origin = origins[0];
      const defaultBehavior = distribution.DefaultCacheBehavior;
      const aliases = distribution.Aliases?.Items ?? [];

      resources.push(
        discovered(
          {
            id: `cloudfront:${distribution.Id}`,
            service: "cloudfront",
            resourceType: "AWS::CloudFront::Distribution",
            name:
              aliases[0] ??
              distribution.DomainName ??
              distribution.Id,
            physicalId: distribution.Id,
            region: "global",
            details: {
              enabled: distribution.Enabled ?? false,
              status: distribution.Status ?? "Unknown",
              domainName: distribution.DomainName ?? null,
              defaultRootObject:
                distribution.DefaultRootObject ?? "",
              aliases: JSON.stringify(aliases),
              certificateArn:
                distribution.ViewerCertificate?.ACMCertificateArn ?? null,
              originCount: origins.length,
              originId: origin?.Id ?? null,
              originDomainName: origin?.DomainName ?? null,
              originPath: origin?.OriginPath ?? "",
              originIsS3: Boolean(origin?.S3OriginConfig),
              defaultTargetOriginId:
                defaultBehavior?.TargetOriginId ?? null,
              lambdaAssociations:
                defaultBehavior?.LambdaFunctionAssociations?.Quantity ?? 0,
              functionAssociations:
                defaultBehavior?.FunctionAssociations?.Quantity ?? 0,
              cacheBehaviors:
                distribution.CacheBehaviors?.Quantity ?? 0,
            },
          },
          ownership,
        ),
      );
    }

    marker = list?.IsTruncated ? list.NextMarker : undefined;
  } while (marker);

  return resources;
}

async function discoverLambda(
  stage: ManagedStage,
  region: string,
  ownership: Map<string, StackOwnershipIndexEntry>,
): Promise<AwsDiscoveredResource[]> {
  const { lambda } = awsClientsForStage(stage, region);
  const resources: AwsDiscoveredResource[] = [];
  let marker: string | undefined;

  do {
    const result = await lambda.send(
      new ListFunctionsCommand({
        Marker: marker,
      }),
    );

    for (const fn of result.Functions ?? []) {
      if (!fn.FunctionName) continue;

      resources.push(
        discovered(
          {
            id: `lambda:${region}:${fn.FunctionName}`,
            service: "lambda",
            resourceType: "AWS::Lambda::Function",
            name: fn.FunctionName,
            physicalId: fn.FunctionName,
            arn: fn.FunctionArn,
            region,
            details: {
              runtime: fn.Runtime ?? null,
              handler: fn.Handler ?? null,
              roleArn: fn.Role ?? null,
              memorySize: fn.MemorySize ?? 128,
              timeout: fn.Timeout ?? 3,
              architecture:
                fn.Architectures?.[0] ?? "x86_64",
              packageType: fn.PackageType ?? "Zip",
              state: fn.State ?? null,
              layerCount: fn.Layers?.length ?? 0,
              environmentVariableCount:
                Object.keys(fn.Environment?.Variables ?? {}).length,
            },
          },
          ownership,
        ),
      );
    }

    marker = result.NextMarker;
  } while (marker);

  return resources;
}

async function discoverDynamoDb(
  stage: ManagedStage,
  region: string,
  ownership: Map<string, StackOwnershipIndexEntry>,
): Promise<AwsDiscoveredResource[]> {
  const { dynamoDB } = awsClientsForStage(stage, region);
  const resources: AwsDiscoveredResource[] = [];
  let exclusiveStartTableName: string | undefined;

  do {
    const result = await dynamoDB.send(
      new ListTablesCommand({
        ExclusiveStartTableName: exclusiveStartTableName,
      }),
    );

    for (const tableName of result.TableNames ?? []) {
      const described = await dynamoDB.send(
        new DescribeTableCommand({
          TableName: tableName,
        }),
      );
      const table = described.Table;
      const hash = table?.KeySchema?.find(
        (entry) => entry.KeyType === "HASH",
      );
      const range = table?.KeySchema?.find(
        (entry) => entry.KeyType === "RANGE",
      );
      const attributeType = (name?: string) =>
        table?.AttributeDefinitions?.find(
          (definition) => definition.AttributeName === name,
        )?.AttributeType ?? null;
      const billingMode =
        table?.BillingModeSummary?.BillingMode ??
        (table?.ProvisionedThroughput
          ? "PROVISIONED"
          : "PAY_PER_REQUEST");

      resources.push(
        discovered(
          {
            id: `dynamodb:${region}:${tableName}`,
            service: "dynamodb",
            resourceType: "AWS::DynamoDB::Table",
            name: tableName,
            physicalId: tableName,
            arn: table?.TableArn,
            region,
            details: {
              status: table?.TableStatus ?? null,
              partitionKey: hash?.AttributeName ?? null,
              partitionKeyType: attributeType(hash?.AttributeName),
              sortKey: range?.AttributeName ?? null,
              sortKeyType: attributeType(range?.AttributeName),
              billingMode,
              readCapacity:
                table?.ProvisionedThroughput?.ReadCapacityUnits ?? null,
              writeCapacity:
                table?.ProvisionedThroughput?.WriteCapacityUnits ?? null,
              deletionProtection:
                table?.DeletionProtectionEnabled ?? false,
              globalSecondaryIndexes:
                table?.GlobalSecondaryIndexes?.length ?? 0,
              localSecondaryIndexes:
                table?.LocalSecondaryIndexes?.length ?? 0,
            },
          },
          ownership,
        ),
      );
    }

    exclusiveStartTableName = result.LastEvaluatedTableName;
  } while (exclusiveStartTableName);

  return resources;
}

export async function discoverAwsStage(
  stage: ManagedStage,
): Promise<AwsStageDiscovery> {
  const identity = await assertAwsStageAccess(stage);
  const regions = uniqueRegions(stage);
  const warnings: string[] = [];
  const stacks: AwsDiscoveredStack[] = [];
  const ownership = new Map<string, StackOwnershipIndexEntry>();

  for (const region of regions) {
    try {
      const discoveredStacks = await discoverStacks(stage, region);
      stacks.push(...discoveredStacks.stacks);

      for (const [physicalId, owner] of discoveredStacks.ownership) {
        ownership.set(physicalId, owner);
      }
    } catch (cause) {
      warnings.push(
        `CloudFormation discovery failed in ${region}: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  }

  const resources: AwsDiscoveredResource[] = [];

  const collect = async (
    label: string,
    operation: () => Promise<AwsDiscoveredResource[]>,
  ) => {
    try {
      resources.push(...(await operation()));
    } catch (cause) {
      warnings.push(
        `${label} discovery failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  };

  await collect("S3", () => discoverS3(stage, ownership));
  await collect("Route53", () => discoverRoute53(stage, ownership));
  await collect("CloudFront", () => discoverCloudFront(stage, ownership));

  const acmRegions = [...new Set([...regions, "us-east-1"])];

  for (const region of acmRegions) {
    await collect(`ACM (${region})`, () =>
      discoverAcm(stage, region, ownership),
    );
  }

  for (const region of regions) {
    await collect(`Lambda (${region})`, () =>
      discoverLambda(stage, region, ownership),
    );
    await collect(`DynamoDB (${region})`, () =>
      discoverDynamoDb(stage, region, ownership),
    );
  }

  resources.sort((a, b) =>
    a.service.localeCompare(b.service) ||
    a.region.localeCompare(b.region) ||
    a.name.localeCompare(b.name),
  );

  stacks.sort((a, b) =>
    a.region.localeCompare(b.region) ||
    a.name.localeCompare(b.name),
  );

  return {
    accountId: identity.accountId,
    scannedAt: new Date().toISOString(),
    regions,
    stacks,
    resources,
    warnings,
  };
}
