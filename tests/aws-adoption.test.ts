import assert from "node:assert/strict";
import test from "node:test";

import {
  assertImportableCloudFront,
  assertImportableDynamoDB,
  assertImportableS3,
  assessAwsDiscoveryResource,
  awsStageAdoptionEnabled,
  s3BucketFromOriginDomain,
  summarizeAwsDiscoveryAdoption,
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
