import assert from "node:assert/strict";
import test from "node:test";

import {
  assertImportableCloudFront,
  assertImportableDynamoDB,
  assertImportableS3,
  s3BucketFromOriginDomain,
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
