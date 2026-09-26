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
