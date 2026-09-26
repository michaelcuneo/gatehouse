import type { ManagedStage } from "@gatehouse/core";
import type { AwsDiscoveredResource } from "./discovery";

export function booleanDiscoveryDetail(
  resource: AwsDiscoveredResource,
  key: string,
): boolean {
  return resource.details?.[key] === true;
}

export function stringDiscoveryDetail(
  resource: AwsDiscoveredResource,
  key: string,
): string | null {
  const value = resource.details?.[key];
  return typeof value === "string" ? value : null;
}

export function numberDiscoveryDetail(
  resource: AwsDiscoveredResource,
  key: string,
): number | null {
  const value = resource.details?.[key];
  return typeof value === "number" ? value : null;
}

export function s3BucketFromOriginDomain(
  domainName: string,
): string | null {
  const match = domainName.match(
    /^(.+)\.s3(?:[.-][^.]+)?\.amazonaws\.com$/i,
  );

  return match?.[1] ?? null;
}

export function assertImportableS3(
  resource: AwsDiscoveredResource,
): {
  public: boolean;
} {
  const flags = [
    booleanDiscoveryDetail(resource, "blockPublicAcls"),
    booleanDiscoveryDetail(resource, "ignorePublicAcls"),
    booleanDiscoveryDetail(resource, "blockPublicPolicy"),
    booleanDiscoveryDetail(resource, "restrictPublicBuckets"),
  ];

  const allBlocked = flags.every(Boolean);
  const allOpen = flags.every((value) => !value);

  if (!allBlocked && !allOpen) {
    throw new Error(
      "This S3 bucket uses mixed Public Access Block settings that GateHouse cannot reproduce exactly yet.",
    );
  }

  return {
    public: allOpen,
  };
}

export function assertImportableDynamoDB(
  resource: AwsDiscoveredResource,
): {
  partitionKey: string;
  partitionKeyType: "S" | "N" | "B";
  sortKey?: string;
  sortKeyType?: "S" | "N" | "B";
  billingMode: "PAY_PER_REQUEST" | "PROVISIONED";
  readCapacity?: number;
  writeCapacity?: number;
  deletionProtection: boolean;
} {
  const partitionKey = stringDiscoveryDetail(
    resource,
    "partitionKey",
  );
  const partitionKeyType = stringDiscoveryDetail(
    resource,
    "partitionKeyType",
  );
  const sortKey = stringDiscoveryDetail(resource, "sortKey");
  const sortKeyType = stringDiscoveryDetail(
    resource,
    "sortKeyType",
  );
  const billingMode = stringDiscoveryDetail(
    resource,
    "billingMode",
  );
  const readCapacity = numberDiscoveryDetail(
    resource,
    "readCapacity",
  );
  const writeCapacity = numberDiscoveryDetail(
    resource,
    "writeCapacity",
  );
  const globalIndexes =
    numberDiscoveryDetail(resource, "globalSecondaryIndexes") ?? 0;
  const localIndexes =
    numberDiscoveryDetail(resource, "localSecondaryIndexes") ?? 0;

  if (globalIndexes || localIndexes) {
    throw new Error(
      "This DynamoDB table has secondary indexes. GateHouse will keep it inventory-only until index management is implemented.",
    );
  }

  if (
    !partitionKey ||
    !["S", "N", "B"].includes(partitionKeyType ?? "") ||
    (sortKey && !["S", "N", "B"].includes(sortKeyType ?? "")) ||
    !["PAY_PER_REQUEST", "PROVISIONED"].includes(
      billingMode ?? "",
    )
  ) {
    throw new Error(
      "DynamoDB discovery did not return a primary-key schema GateHouse can represent safely.",
    );
  }

  return {
    partitionKey,
    partitionKeyType: partitionKeyType as "S" | "N" | "B",
    sortKey: sortKey ?? undefined,
    sortKeyType: sortKey
      ? (sortKeyType as "S" | "N" | "B")
      : undefined,
    billingMode: billingMode as
      | "PAY_PER_REQUEST"
      | "PROVISIONED",
    readCapacity:
      billingMode === "PROVISIONED"
        ? (readCapacity ?? 1)
        : undefined,
    writeCapacity:
      billingMode === "PROVISIONED"
        ? (writeCapacity ?? 1)
        : undefined,
    deletionProtection: booleanDiscoveryDetail(
      resource,
      "deletionProtection",
    ),
  };
}

export function assertImportableCloudFront(
  resource: AwsDiscoveredResource,
): {
  originId: string;
  originDomainName: string;
  originPath: string;
  bucketName: string;
  aliases: string[];
  certificateArn?: string;
  defaultRootObject: string;
} {
  const originCount =
    numberDiscoveryDetail(resource, "originCount") ?? 0;
  const originId = stringDiscoveryDetail(resource, "originId");
  const originDomainName = stringDiscoveryDetail(
    resource,
    "originDomainName",
  );
  const originPath =
    stringDiscoveryDetail(resource, "originPath") ?? "";
  const originIsS3 = booleanDiscoveryDetail(
    resource,
    "originIsS3",
  );
  const defaultTargetOriginId = stringDiscoveryDetail(
    resource,
    "defaultTargetOriginId",
  );
  const cacheBehaviors =
    numberDiscoveryDetail(resource, "cacheBehaviors") ?? 0;
  const lambdaAssociations =
    numberDiscoveryDetail(resource, "lambdaAssociations") ?? 0;
  const functionAssociations =
    numberDiscoveryDetail(resource, "functionAssociations") ?? 0;
  const aliasesJson = stringDiscoveryDetail(resource, "aliases");
  const certificateArn = stringDiscoveryDetail(
    resource,
    "certificateArn",
  );
  const defaultRootObject =
    stringDiscoveryDetail(resource, "defaultRootObject") ?? "";

  let aliases: string[] = [];

  try {
    const parsed = aliasesJson ? JSON.parse(aliasesJson) : [];
    aliases = Array.isArray(parsed)
      ? parsed.filter(
          (alias): alias is string =>
            typeof alias === "string" && Boolean(alias.trim()),
        )
      : [];
  } catch {
    aliases = [];
  }

  if (
    originCount !== 1 ||
    !originId ||
    !originDomainName ||
    !originIsS3 ||
    defaultTargetOriginId !== originId ||
    cacheBehaviors !== 0 ||
    lambdaAssociations !== 0 ||
    functionAssociations !== 0
  ) {
    throw new Error(
      "This CloudFront distribution has multiple origins, additional cache behaviours, or edge functions that GateHouse cannot reproduce safely yet.",
    );
  }

  const bucketName = s3BucketFromOriginDomain(originDomainName);

  if (!bucketName) {
    throw new Error(
      "GateHouse could not map the CloudFront origin to an S3 bucket safely.",
    );
  }

  if (aliases.length && !certificateArn) {
    throw new Error(
      "This CloudFront distribution uses custom aliases but no ACM certificate ARN was discovered.",
    );
  }

  return {
    originId,
    originDomainName,
    originPath,
    bucketName,
    aliases,
    certificateArn: certificateArn ?? undefined,
    defaultRootObject,
  };
}


export type AwsDiscoveryAdoptionState =
  | "importable"
  | "paired"
  | "inventory_only";

export interface AwsDiscoveryAdoptionAssessment {
  state: AwsDiscoveryAdoptionState;
  importable: boolean;
  reason?: string;
  requires?: string[];
}

function assessmentFailure(
  cause: unknown,
): AwsDiscoveryAdoptionAssessment {
  return {
    state: "inventory_only",
    importable: false,
    reason: cause instanceof Error ? cause.message : String(cause),
  };
}

export function assessAwsDiscoveryResource(
  resource: AwsDiscoveredResource,
  resources: AwsDiscoveredResource[],
): AwsDiscoveryAdoptionAssessment {
  try {
    if (
      resource.service === "s3" &&
      resource.resourceType === "AWS::S3::Bucket"
    ) {
      assertImportableS3(resource);
      return {
        state: "importable",
        importable: true,
      };
    }

    if (
      resource.service === "acm" &&
      resource.resourceType ===
        "AWS::CertificateManager::Certificate"
    ) {
      if (!resource.arn || !stringDiscoveryDetail(resource, "domains")) {
        throw new Error(
          "ACM discovery did not return the certificate ARN and domain set required for safe import.",
        );
      }

      return {
        state: "importable",
        importable: true,
      };
    }

    if (
      resource.service === "dynamodb" &&
      resource.resourceType === "AWS::DynamoDB::Table"
    ) {
      assertImportableDynamoDB(resource);
      return {
        state: "importable",
        importable: true,
      };
    }

    if (
      resource.service === "cloudfront" &&
      resource.resourceType === "AWS::CloudFront::Distribution"
    ) {
      const cloudFront = assertImportableCloudFront(resource);
      const requires = [
        `S3 bucket: ${cloudFront.bucketName}`,
        ...(cloudFront.certificateArn
          ? [`ACM certificate: ${cloudFront.certificateArn}`]
          : []),
      ];

      return {
        state: "importable",
        importable: true,
        requires,
      };
    }

    if (
      resource.service === "lambda" &&
      resource.resourceType === "AWS::Lambda::Function"
    ) {
      const roleArn = stringDiscoveryDetail(resource, "roleArn");
      const memorySize = numberDiscoveryDetail(resource, "memorySize");
      const timeout = numberDiscoveryDetail(resource, "timeout");
      const architecture = stringDiscoveryDetail(
        resource,
        "architecture",
      );

      if (
        !roleArn ||
        memorySize === null ||
        timeout === null ||
        !["x86_64", "arm64"].includes(architecture ?? "")
      ) {
        throw new Error(
          "Lambda discovery did not return enough configuration to import this function safely.",
        );
      }

      return {
        state: "importable",
        importable: true,
      };
    }

    if (
      resource.service === "route53" &&
      resource.resourceType === "AWS::Route53::RecordSet"
    ) {
      const type = stringDiscoveryDetail(resource, "type");
      const zone = stringDiscoveryDetail(resource, "zone");
      const value = stringDiscoveryDetail(resource, "value");
      const ttl = numberDiscoveryDetail(resource, "ttl");
      const alias = booleanDiscoveryDetail(resource, "alias");
      const aliasDnsName = stringDiscoveryDetail(
        resource,
        "aliasDnsName",
      );
      const valueCount = numberDiscoveryDetail(
        resource,
        "valueCount",
      );

      if (alias) {
        if (
          type === "AAAA" &&
          zone &&
          aliasDnsName
        ) {
          const pair = resources.find(
            (candidate) =>
              candidate.service === "route53" &&
              candidate.resourceType === "AWS::Route53::RecordSet" &&
              candidate.name === resource.name &&
              stringDiscoveryDetail(candidate, "zone") === zone &&
              stringDiscoveryDetail(candidate, "type") === "A" &&
              booleanDiscoveryDetail(candidate, "alias") &&
              stringDiscoveryDetail(candidate, "aliasDnsName") ===
                aliasDnsName,
          );

          return pair
            ? {
                state: "paired",
                importable: false,
                reason:
                  "Imported together with the matching A CloudFront alias record.",
                requires: [`Route53 A record: ${pair.name}`],
              }
            : {
                state: "inventory_only",
                importable: false,
                reason:
                  "AAAA alias has no matching A CloudFront alias record in discovery.",
              };
        }

        if (type !== "A" || !zone || !aliasDnsName) {
          throw new Error(
            "Only the A member of a complete CloudFront A/AAAA alias pair can be imported directly.",
          );
        }

        const ipv6Pair = resources.find(
          (candidate) =>
            candidate.service === "route53" &&
            candidate.resourceType === "AWS::Route53::RecordSet" &&
            candidate.name === resource.name &&
            stringDiscoveryDetail(candidate, "zone") === zone &&
            stringDiscoveryDetail(candidate, "type") === "AAAA" &&
            booleanDiscoveryDetail(candidate, "alias") &&
            stringDiscoveryDetail(candidate, "aliasDnsName") ===
              aliasDnsName,
        );

        if (!ipv6Pair) {
          throw new Error(
            "GateHouse requires the matching AAAA CloudFront alias before importing this DNS pair.",
          );
        }

        const normalizedTarget = aliasDnsName
          .replace(/\.$/, "")
          .toLowerCase();
        const distribution = resources.find(
          (candidate) =>
            candidate.service === "cloudfront" &&
            candidate.resourceType ===
              "AWS::CloudFront::Distribution" &&
            String(candidate.details?.domainName ?? "")
              .replace(/\.$/, "")
              .toLowerCase() === normalizedTarget,
        );

        if (!distribution) {
          throw new Error(
            "The CloudFront distribution targeted by this Route53 alias is not present in discovery.",
          );
        }

        return {
          state: "importable",
          importable: true,
          requires: [
            `CloudFront distribution: ${distribution.name}`,
            `Route53 AAAA pair: ${ipv6Pair.name}`,
          ],
        };
      }

      if (
        valueCount !== 1 ||
        !zone ||
        !value ||
        ttl === null ||
        !["A", "AAAA", "CNAME", "TXT"].includes(type ?? "")
      ) {
        throw new Error(
          "This Route53 record is not yet representable as a GateHouse value record.",
        );
      }

      return {
        state: "importable",
        importable: true,
      };
    }

    return {
      state: "inventory_only",
      importable: false,
      reason:
        "GateHouse can inventory this AWS resource but does not have a safe adoption model for it yet.",
    };
  } catch (cause) {
    return assessmentFailure(cause);
  }
}

export function summarizeAwsDiscoveryAdoption(
  resources: AwsDiscoveredResource[],
): {
  total: number;
  importable: number;
  paired: number;
  inventoryOnly: number;
  external: number;
  observed: number;
} {
  let importable = 0;
  let paired = 0;
  let inventoryOnly = 0;

  for (const resource of resources) {
    const assessment = assessAwsDiscoveryResource(
      resource,
      resources,
    );

    if (assessment.state === "importable") {
      importable += 1;
    } else if (assessment.state === "paired") {
      paired += 1;
    } else {
      inventoryOnly += 1;
    }
  }

  return {
    total: resources.length,
    importable,
    paired,
    inventoryOnly,
    external: resources.filter(
      (resource) => resource.ownership === "external",
    ).length,
    observed: resources.filter(
      (resource) => resource.ownership === "observed",
    ).length,
  };
}


export function awsStageAdoptionEnabled(
  stage: Pick<ManagedStage, "adoptionMode">,
): boolean {
  return (stage.adoptionMode ?? "read_only") === "enabled";
}


export interface AwsDiscoveryDogfoodReport {
  format: "gatehouse-aws-discovery-report";
  version: 1;
  exportedAt: string;
  project: {
    id: string;
    name: string;
    slug: string;
  };
  stage: {
    id: string;
    name: string;
    accountId: string;
    primaryRegion: string;
    additionalRegions: string[];
    adoptionMode: "read_only" | "enabled";
  };
  discovery: {
    accountId: string;
    scannedAt: string;
    regions: string[];
    warnings: string[];
    stacks: import("./discovery").AwsDiscoveredStack[];
    summary: ReturnType<typeof summarizeAwsDiscoveryAdoption>;
    resources: Array<
      import("./discovery").AwsDiscoveredResource & {
        adoption: AwsDiscoveryAdoptionAssessment;
      }
    >;
  };
}

export function buildAwsDiscoveryDogfoodReport(input: {
  project: {
    id: string;
    name: string;
    slug: string;
  };
  stage: Pick<
    ManagedStage,
    | "id"
    | "name"
    | "accountId"
    | "primaryRegion"
    | "additionalRegions"
    | "adoptionMode"
  >;
  discovery: import("./discovery").AwsStageDiscovery;
  exportedAt?: string;
}): AwsDiscoveryDogfoodReport {
  const { discovery } = input;

  return {
    format: "gatehouse-aws-discovery-report",
    version: 1,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    project: {
      id: input.project.id,
      name: input.project.name,
      slug: input.project.slug,
    },
    stage: {
      id: input.stage.id,
      name: input.stage.name,
      accountId: input.stage.accountId,
      primaryRegion: input.stage.primaryRegion,
      additionalRegions: input.stage.additionalRegions ?? [],
      adoptionMode: input.stage.adoptionMode ?? "read_only",
    },
    discovery: {
      accountId: discovery.accountId,
      scannedAt: discovery.scannedAt,
      regions: discovery.regions,
      warnings: discovery.warnings,
      stacks: discovery.stacks,
      summary: summarizeAwsDiscoveryAdoption(discovery.resources),
      resources: discovery.resources.map((resource) => ({
        ...resource,
        adoption: assessAwsDiscoveryResource(
          resource,
          discovery.resources,
        ),
      })),
    },
  };
}
