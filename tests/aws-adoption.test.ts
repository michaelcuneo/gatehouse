import assert from "node:assert/strict";
import test from "node:test";

import {
  assertImportableCloudFront,
  assertImportableDynamoDB,
  assertImportableS3,
  assessAwsDiscoveryResource,
  awsStageAdoptionEnabled,
  buildAwsDiscoveryDogfoodReport,
  evaluateAwsDogfoodReadiness,
  s3BucketFromOriginDomain,
  summarizeAwsDiscoveryAdoption,
  summarizeAwsDiscoveryAdoptionGaps,
} from "../packages/aws/src/adoption.ts";

function discovered(
  service: any,
  resourceType: string,
  details: Record<string, unknown>,
) {
  return {
    id: "resource-1",
    service,
    resourceType,
    name: "resource",
    physicalId: "physical",
    region: "ap-southeast-2",
    ownership: "observed",
    details,
  } as any;
}

test("S3 adoption accepts fully blocked or fully open access only", () => {
  assert.deepEqual(
    assertImportableS3(
      discovered("s3", "AWS::S3::Bucket", {
        blockPublicAcls: true,
        ignorePublicAcls: true,
        blockPublicPolicy: true,
        restrictPublicBuckets: true,
      }),
    ),
    { public: false },
  );

  assert.deepEqual(
    assertImportableS3(
      discovered("s3", "AWS::S3::Bucket", {
        blockPublicAcls: false,
        ignorePublicAcls: false,
        blockPublicPolicy: false,
        restrictPublicBuckets: false,
      }),
    ),
    { public: true },
  );

  assert.throws(
    () =>
      assertImportableS3(
        discovered("s3", "AWS::S3::Bucket", {
          blockPublicAcls: true,
          ignorePublicAcls: true,
          blockPublicPolicy: false,
          restrictPublicBuckets: true,
        }),
      ),
    /mixed Public Access Block settings/i,
  );
});

test("DynamoDB adoption rejects indexes and extracts safe schemas", () => {
  assert.throws(
    () =>
      assertImportableDynamoDB(
        discovered("dynamodb", "AWS::DynamoDB::Table", {
          partitionKey: "pk",
          partitionKeyType: "S",
          billingMode: "PAY_PER_REQUEST",
          globalSecondaryIndexes: 1,
          localSecondaryIndexes: 0,
        }),
      ),
    /secondary indexes/i,
  );

  assert.deepEqual(
    assertImportableDynamoDB(
      discovered("dynamodb", "AWS::DynamoDB::Table", {
        partitionKey: "pk",
        partitionKeyType: "S",
        sortKey: "sk",
        sortKeyType: "N",
        billingMode: "PROVISIONED",
        readCapacity: 5,
        writeCapacity: 2,
        deletionProtection: true,
        globalSecondaryIndexes: 0,
        localSecondaryIndexes: 0,
      }),
    ),
    {
      partitionKey: "pk",
      partitionKeyType: "S",
      sortKey: "sk",
      sortKeyType: "N",
      billingMode: "PROVISIONED",
      readCapacity: 5,
      writeCapacity: 2,
      deletionProtection: true,
    },
  );
});

test("S3 CloudFront origin domains map to bucket names", () => {
  assert.equal(
    s3BucketFromOriginDomain(
      "example-bucket.s3.ap-southeast-2.amazonaws.com",
    ),
    "example-bucket",
  );

  assert.equal(
    s3BucketFromOriginDomain(
      "example-bucket.s3.amazonaws.com",
    ),
    "example-bucket",
  );

  assert.equal(
    s3BucketFromOriginDomain("api.example.com"),
    null,
  );
});

test("CloudFront adoption requires one simple S3 origin with no edge functions", () => {
  const base = {
    originCount: 1,
    originId: "origin-1",
    originDomainName:
      "example-bucket.s3.ap-southeast-2.amazonaws.com",
    originPath: "/site",
    originIsS3: true,
    defaultTargetOriginId: "origin-1",
    cacheBehaviors: 0,
    lambdaAssociations: 0,
    functionAssociations: 0,
    aliases: "[]",
    defaultRootObject: "index.html",
  };

  assert.deepEqual(
    assertImportableCloudFront(
      discovered(
        "cloudfront",
        "AWS::CloudFront::Distribution",
        base,
      ),
    ),
    {
      originId: "origin-1",
      originDomainName:
        "example-bucket.s3.ap-southeast-2.amazonaws.com",
      originPath: "/site",
      bucketName: "example-bucket",
      aliases: [],
      certificateArn: undefined,
      defaultRootObject: "index.html",
    },
  );

  assert.throws(
    () =>
      assertImportableCloudFront(
        discovered(
          "cloudfront",
          "AWS::CloudFront::Distribution",
          {
            ...base,
            cacheBehaviors: 1,
          },
        ),
      ),
    /cannot reproduce safely/i,
  );

  assert.throws(
    () =>
      assertImportableCloudFront(
        discovered(
          "cloudfront",
          "AWS::CloudFront::Distribution",
          {
            ...base,
            lambdaAssociations: 1,
          },
        ),
      ),
    /cannot reproduce safely/i,
  );
});

test("CloudFront aliases require a discovered ACM certificate ARN", () => {
  const details = {
    originCount: 1,
    originId: "origin-1",
    originDomainName: "bucket.s3.amazonaws.com",
    originPath: "",
    originIsS3: true,
    defaultTargetOriginId: "origin-1",
    cacheBehaviors: 0,
    lambdaAssociations: 0,
    functionAssociations: 0,
    aliases: JSON.stringify(["www.example.com"]),
    defaultRootObject: "index.html",
  };

  assert.throws(
    () =>
      assertImportableCloudFront(
        discovered(
          "cloudfront",
          "AWS::CloudFront::Distribution",
          details,
        ),
      ),
    /no ACM certificate ARN was discovered/i,
  );

  const accepted = assertImportableCloudFront(
    discovered(
      "cloudfront",
      "AWS::CloudFront::Distribution",
      {
        ...details,
        certificateArn:
          "arn:aws:acm:us-east-1:123456789012:certificate/test",
      },
    ),
  );

  assert.deepEqual(accepted.aliases, ["www.example.com"]);
  assert.equal(
    accepted.certificateArn,
    "arn:aws:acm:us-east-1:123456789012:certificate/test",
  );
});


test("discovery assessment handles Route53 CloudFront alias pairs consistently", () => {
  const distribution = {
    id: "cloudfront:D123",
    service: "cloudfront",
    resourceType: "AWS::CloudFront::Distribution",
    name: "www.example.com",
    physicalId: "D123",
    region: "global",
    ownership: "observed",
    details: {
      domainName: "d123.cloudfront.net",
      originCount: 1,
      originId: "origin-1",
      originDomainName: "bucket.s3.amazonaws.com",
      originPath: "",
      originIsS3: true,
      defaultTargetOriginId: "origin-1",
      cacheBehaviors: 0,
      lambdaAssociations: 0,
      functionAssociations: 0,
      aliases: JSON.stringify(["www.example.com"]),
      certificateArn:
        "arn:aws:acm:us-east-1:123456789012:certificate/test",
      defaultRootObject: "index.html",
    },
  } as any;

  const a = {
    id: "route53:a",
    service: "route53",
    resourceType: "AWS::Route53::RecordSet",
    name: "www.example.com.",
    physicalId: "www.example.com",
    region: "global",
    ownership: "observed",
    details: {
      zone: "example.com",
      type: "A",
      alias: true,
      aliasDnsName: "d123.cloudfront.net",
      valueCount: 0,
    },
  } as any;

  const aaaa = {
    ...a,
    id: "route53:aaaa",
    details: {
      ...a.details,
      type: "AAAA",
    },
  } as any;

  const resources = [distribution, a, aaaa];

  const aAssessment = assessAwsDiscoveryResource(
    a,
    resources,
  );
  const aaaaAssessment = assessAwsDiscoveryResource(
    aaaa,
    resources,
  );

  assert.equal(aAssessment.state, "importable");
  assert.equal(aAssessment.importable, true);
  assert.ok(
    aAssessment.requires?.some((value) =>
      value.includes("CloudFront distribution"),
    ),
  );

  assert.equal(aaaaAssessment.state, "paired");
  assert.equal(aaaaAssessment.importable, false);
});

test("discovery summary separates importable, paired, inventory-only and ownership counts", () => {
  const resources = [
    discovered("s3", "AWS::S3::Bucket", {
      blockPublicAcls: true,
      ignorePublicAcls: true,
      blockPublicPolicy: true,
      restrictPublicBuckets: true,
    }),
    {
      ...discovered("s3", "AWS::S3::Bucket", {
        blockPublicAcls: true,
        ignorePublicAcls: false,
        blockPublicPolicy: true,
        restrictPublicBuckets: true,
      }),
      id: "resource-2",
      ownership: "external",
    },
    {
      id: "unknown-1",
      service: "route53",
      resourceType: "AWS::Route53::HostedZone",
      name: "example.com.",
      physicalId: "Z123",
      region: "global",
      ownership: "observed",
    },
  ] as any[];

  const summary = summarizeAwsDiscoveryAdoption(resources);

  assert.deepEqual(summary, {
    total: 3,
    importable: 1,
    paired: 0,
    inventoryOnly: 2,
    external: 1,
    observed: 2,
  });
});


test("stage adoption is locked by default and only explicit enabled mode unlocks it", () => {
  assert.equal(
    awsStageAdoptionEnabled({}),
    false,
  );

  assert.equal(
    awsStageAdoptionEnabled({
      adoptionMode: "read_only",
    }),
    false,
  );

  assert.equal(
    awsStageAdoptionEnabled({
      adoptionMode: "enabled",
    }),
    true,
  );
});


test("dogfood discovery report excludes AWS access credentials and carries adoption assessments", () => {
  const discovery = {
    accountId: "123456789012",
    scannedAt: "2026-09-26T10:00:00.000Z",
    regions: ["ap-southeast-2"],
    stacks: [],
    warnings: [],
    resources: [
      discovered("s3", "AWS::S3::Bucket", {
        blockPublicAcls: true,
        ignorePublicAcls: true,
        blockPublicPolicy: true,
        restrictPublicBuckets: true,
      }),
    ],
  } as any;

  const report = buildAwsDiscoveryDogfoodReport({
    project: {
      id: "project-1",
      name: "Example",
      slug: "example",
    },
    stage: {
      id: "stage-1",
      name: "production",
      accountId: "123456789012",
      primaryRegion: "ap-southeast-2",
      additionalRegions: ["us-east-1"],
      adoptionMode: "read_only",
    },
    discovery,
    exportedAt: "2026-09-26T11:00:00.000Z",
  });

  assert.equal(
    report.format,
    "gatehouse-aws-discovery-report",
  );
  assert.equal(report.version, 1);
  assert.equal(report.stage.adoptionMode, "read_only");
  assert.equal(report.discovery.summary.importable, 1);
  assert.equal(
    report.discovery.resources[0]?.adoption.state,
    "importable",
  );

  const serialized = JSON.stringify(report);

  assert.equal(serialized.includes("roleArn"), false);
  assert.equal(serialized.includes("externalId"), false);
  assert.equal(serialized.includes("sourceIdentity"), false);
  assert.equal(serialized.includes('"access"'), false);
});


test("dogfood readiness requires lock, account match, full region coverage and no warnings", () => {
  const stage = {
    accountId: "123456789012",
    primaryRegion: "ap-southeast-2",
    additionalRegions: ["us-east-1"],
    adoptionMode: "read_only" as const,
  };

  const healthyDiscovery = {
    accountId: "123456789012",
    scannedAt: "2026-09-26T10:00:00.000Z",
    regions: ["ap-southeast-2", "us-east-1"],
    stacks: [],
    resources: [],
    warnings: [],
  } as any;

  const ready = evaluateAwsDogfoodReadiness(
    stage,
    healthyDiscovery,
  );

  assert.equal(ready.ready, true);
  assert.deepEqual(ready.blockers, []);

  const unlocked = evaluateAwsDogfoodReadiness(
    {
      ...stage,
      adoptionMode: "enabled",
    },
    healthyDiscovery,
  );

  assert.equal(unlocked.ready, false);
  assert.ok(
    unlocked.blockers.some((value) =>
      value.includes("lock is not active"),
    ),
  );

  const wrongAccount = evaluateAwsDogfoodReadiness(
    stage,
    {
      ...healthyDiscovery,
      accountId: "999999999999",
    },
  );

  assert.equal(wrongAccount.ready, false);
  assert.ok(
    wrongAccount.blockers.some((value) =>
      value.includes("does not match configured account"),
    ),
  );

  const missingRegion = evaluateAwsDogfoodReadiness(
    stage,
    {
      ...healthyDiscovery,
      regions: ["ap-southeast-2"],
    },
  );

  assert.equal(missingRegion.ready, false);
  assert.ok(
    missingRegion.blockers.some((value) =>
      value.includes("us-east-1"),
    ),
  );

  const warned = evaluateAwsDogfoodReadiness(
    stage,
    {
      ...healthyDiscovery,
      warnings: ["AccessDenied on service"],
    },
  );

  assert.equal(warned.ready, false);
  assert.ok(
    warned.blockers.some((value) =>
      value.includes("1 warning"),
    ),
  );

  const unscanned = evaluateAwsDogfoodReadiness(
    stage,
    null,
  );

  assert.equal(unscanned.ready, false);
  assert.ok(unscanned.blockers.length >= 3);
});


test("adoption gap summary groups identical unsupported resource shapes", () => {
  const resources = [
    {
      id: "queue-1",
      service: "cloudformation",
      resourceType: "AWS::SQS::Queue",
      name: "QueueOne",
      physicalId: "queue-one",
      region: "ap-southeast-2",
      ownership: "external",
    },
    {
      id: "queue-2",
      service: "cloudformation",
      resourceType: "AWS::SQS::Queue",
      name: "QueueTwo",
      physicalId: "queue-two",
      region: "ap-southeast-2",
      ownership: "external",
    },
    {
      id: "topic-1",
      service: "cloudformation",
      resourceType: "AWS::SNS::Topic",
      name: "Topic",
      physicalId: "topic",
      region: "ap-southeast-2",
      ownership: "external",
    },
  ] as any[];

  const gaps = summarizeAwsDiscoveryAdoptionGaps(
    resources,
  );

  assert.equal(gaps.length, 2);
  assert.equal(gaps[0]?.resourceType, "AWS::SQS::Queue");
  assert.equal(gaps[0]?.count, 2);
  assert.equal(gaps[1]?.resourceType, "AWS::SNS::Topic");
  assert.equal(gaps[1]?.count, 1);
});
