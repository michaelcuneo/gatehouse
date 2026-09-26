import assert from "node:assert/strict";
import test from "node:test";

import {
  assertImportableCloudFront,
  assertImportableDynamoDB,
  assertImportableS3,
  assessAwsDiscoveryResource,
  awsStageAdoptionEnabled,
  buildAwsDiscoveryDogfoodReport,
  evaluateAwsAdoptionUnlockReadiness,
  evaluateAwsDogfoodReadiness,
  s3BucketFromOriginDomain,
  summarizeAwsDiscoveryAdoption,
  summarizeAwsDiscoveryAdoptionGaps,
} from "../packages/aws/src/adoption.ts";

function completeCoverage(regions: string[]) {
  const uniqueRegions = [...new Set(regions)];
  const acmRegions = [...new Set([...uniqueRegions, "us-east-1"])];
  const entries = [
    { service: "s3", region: "global", label: "S3" },
    { service: "route53", region: "global", label: "Route53" },
    { service: "cloudfront", region: "global", label: "CloudFront" },
    ...uniqueRegions.flatMap((region) => [
      {
        service: "cloudformation",
        region,
        label: `CloudFormation (${region})`,
      },
      {
        service: "lambda",
        region,
        label: `Lambda (${region})`,
      },
      {
        service: "dynamodb",
        region,
        label: `DynamoDB (${region})`,
      },
      {
        service: "logs",
        region,
        label: `CloudWatch Logs (${region})`,
      },
      {
        service: "cloudwatch",
        region,
        label: `CloudWatch Alarms (${region})`,
      },
    ]),
    ...acmRegions.map((region) => ({
      service: "acm",
      region,
      label: `ACM (${region})`,
    })),
  ];

  return entries.map((entry) => ({
    ...entry,
    status: "complete" as const,
    discovered: 0,
  }));
}

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
      enabled: true,
    }),
    false,
  );

  assert.equal(
    awsStageAdoptionEnabled({
      adoptionMode: "enabled",
      enabled: true,
    }),
    true,
  );
});


test("dogfood discovery report excludes AWS access credentials and carries adoption assessments", () => {
  const discovery = {
    accountId: "123456789012",
    scannedAt: "2026-09-26T10:55:00.000Z",
    regions: ["ap-southeast-2", "us-east-1"],
    stacks: [],
    warnings: [],
    coverage: completeCoverage([
      "ap-southeast-2",
      "us-east-1",
    ]),
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
      enabled: true,
    },
    discovery,
    localImports: {
      "resource-1": {
        id: "local-resource-1",
        kind: "storage_bucket",
        ownership: "observed",
        healthy: true,
        status: "ready",
      },
    },
    exportedAt: "2026-09-26T11:00:00.000Z",
  });

  assert.equal(
    report.format,
    "gatehouse-aws-discovery-report",
  );
  assert.equal(report.version, 2);
  assert.equal(report.stage.adoptionMode, "read_only");
  assert.equal(report.discovery.summary.importable, 1);
  assert.equal(report.discovery.dogfoodReadiness.ready, true);
  assert.equal(report.discovery.adoptionSafety.ready, true);
  assert.equal(
    report.discovery.resources[0]?.adoption.state,
    "importable",
  );
  assert.deepEqual(
    report.discovery.resources[0]?.localImport,
    {
      id: "local-resource-1",
      kind: "storage_bucket",
      ownership: "observed",
      healthy: true,
      status: "ready",
    },
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
    enabled: true,
  };

  const healthyDiscovery = {
    accountId: "123456789012",
    scannedAt: "2026-09-26T10:00:00.000Z",
    regions: ["ap-southeast-2", "us-east-1"],
    stacks: [],
    resources: [],
    warnings: [],
    coverage: completeCoverage([
      "ap-southeast-2",
      "us-east-1",
    ]),
  } as any;

  const readinessOptions = {
    now: Date.parse("2026-09-26T10:10:00.000Z"),
  };

  const ready = evaluateAwsDogfoodReadiness(
    stage,
    healthyDiscovery,
    readinessOptions,
  );

  assert.equal(ready.ready, true);
  assert.deepEqual(ready.blockers, []);

  const disabledStage = evaluateAwsDogfoodReadiness(
    {
      ...stage,
      enabled: false,
    },
    healthyDiscovery,
    readinessOptions,
  );

  assert.equal(disabledStage.ready, false);
  assert.ok(
    disabledStage.blockers.some((value) =>
      value.includes("Stage is disabled"),
    ),
  );

  const unlocked = evaluateAwsDogfoodReadiness(
    {
      ...stage,
      adoptionMode: "enabled",
      enabled: true,
    },
    healthyDiscovery,
    readinessOptions,
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
    readinessOptions,
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
    readinessOptions,
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
    readinessOptions,
  );

  assert.equal(warned.ready, false);
  assert.ok(
    warned.blockers.some((value) =>
      value.includes("1 warning"),
    ),
  );

  const legacySnapshot = evaluateAwsDogfoodReadiness(
    stage,
    {
      ...healthyDiscovery,
      coverage: undefined,
    },
    readinessOptions,
  );

  assert.equal(legacySnapshot.ready, false);
  assert.ok(
    legacySnapshot.blockers.some((value) =>
      value.includes("did not run all expected service probes"),
    ),
  );

  const incompleteCoverage = evaluateAwsDogfoodReadiness(
    stage,
    {
      ...healthyDiscovery,
      coverage: healthyDiscovery.coverage.filter(
        (entry: any) =>
          !(
            entry.service === "lambda" &&
            entry.region === "us-east-1"
          ),
      ),
    },
    readinessOptions,
  );

  assert.equal(incompleteCoverage.ready, false);
  assert.ok(
    incompleteCoverage.blockers.some((value) =>
      value.includes("lambda (us-east-1)"),
    ),
  );

  const stale = evaluateAwsDogfoodReadiness(
    stage,
    healthyDiscovery,
    {
      now: Date.parse("2026-09-26T11:00:00.000Z"),
    },
  );

  assert.equal(stale.ready, false);
  assert.ok(
    stale.blockers.some((value) =>
      value.includes("snapshot is stale"),
    ),
  );

  const unscanned = evaluateAwsDogfoodReadiness(
    stage,
    null,
    readinessOptions,
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


test("CloudWatch logs and alarms remain visible but inventory-only", () => {
  const logGroup = {
    id: "logs:ap-southeast-2:/aws/lambda/api",
    service: "logs",
    resourceType: "AWS::Logs::LogGroup",
    name: "/aws/lambda/api",
    physicalId: "/aws/lambda/api",
    region: "ap-southeast-2",
    ownership: "observed",
    details: {
      retentionInDays: 14,
    },
  } as any;

  const alarm = {
    id: "cloudwatch:ap-southeast-2:alarm:errors",
    service: "cloudwatch",
    resourceType: "AWS::CloudWatch::Alarm",
    name: "errors",
    physicalId: "errors",
    region: "ap-southeast-2",
    ownership: "observed",
    details: {
      stateValue: "OK",
    },
  } as any;

  const logAssessment = assessAwsDiscoveryResource(
    logGroup,
    [logGroup, alarm],
  );
  const alarmAssessment = assessAwsDiscoveryResource(
    alarm,
    [logGroup, alarm],
  );

  assert.equal(logAssessment.state, "inventory_only");
  assert.equal(logAssessment.importable, false);
  assert.match(
    logAssessment.reason ?? "",
    /first-class log-group resource/i,
  );

  assert.equal(alarmAssessment.state, "inventory_only");
  assert.equal(alarmAssessment.importable, false);
  assert.match(
    alarmAssessment.reason ?? "",
    /represent alarm metrics, dimensions, actions and evaluation settings exactly/i,
  );
});


test("adoption unlock preflight evaluates the proposed stage under the read-only lock", () => {
  const stage = {
    accountId: "123456789012",
    primaryRegion: "ap-southeast-2",
    additionalRegions: ["us-east-1"],
    adoptionMode: "enabled" as const,
    enabled: true,
  };

  const discovery = {
    accountId: "123456789012",
    scannedAt: "2026-09-26T10:00:00.000Z",
    regions: ["ap-southeast-2", "us-east-1"],
    stacks: [],
    resources: [],
    warnings: [],
  } as any;

  const ready = evaluateAwsAdoptionUnlockReadiness(
    stage,
    discovery,
    {
      now: Date.parse("2026-09-26T10:05:00.000Z"),
    },
  );

  assert.equal(ready.ready, true);
  assert.equal(
    ready.checks.find(
      (check) => check.id === "read_only_lock",
    )?.ok,
    true,
  );

  const stale = evaluateAwsAdoptionUnlockReadiness(
    stage,
    discovery,
    {
      now: Date.parse("2026-09-26T11:00:00.000Z"),
    },
  );

  assert.equal(stale.ready, false);
  assert.ok(
    stale.blockers.some((value) =>
      value.includes("snapshot is stale"),
    ),
  );

  const warned = evaluateAwsAdoptionUnlockReadiness(
    stage,
    {
      ...discovery,
      warnings: ["CloudWatch denied"],
    },
    {
      now: Date.parse("2026-09-26T10:05:00.000Z"),
    },
  );

  assert.equal(warned.ready, false);
  assert.ok(
    warned.blockers.some((value) =>
      value.includes("1 warning"),
    ),
  );
});
