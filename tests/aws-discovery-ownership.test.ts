import assert from "node:assert/strict";
import test from "node:test";

import {
  discovered,
  normalisePhysicalId,
  ownerFor,
  stackOwnerType,
} from "../packages/aws/src/discovery.ts";

test("physical IDs normalize trailing dots, case and pipe-separated values", () => {
  assert.deepEqual(
    normalisePhysicalId("Example.COM.|Secondary"),
    [
      "Example.COM.|Secondary",
      "Example.COM.|Secondary",
      "example.com.|secondary",
      "example.com.|secondary",
      "Example.COM.",
      "Example.COM",
      "example.com.",
      "example.com",
      "Secondary",
      "Secondary",
      "secondary",
      "secondary",
    ].filter((value, index, all) => all.indexOf(value) === index),
  );

  const normalized = normalisePhysicalId("Example.COM.");

  assert.ok(normalized.includes("Example.COM."));
  assert.ok(normalized.includes("Example.COM"));
  assert.ok(normalized.includes("example.com."));
  assert.ok(normalized.includes("example.com"));
});

test("stack owner detection distinguishes SST, CDK and plain CloudFormation", () => {
  assert.equal(
    stackOwnerType(undefined, [
      { Key: "sst:app", Value: "example" },
    ]),
    "sst",
  );

  assert.equal(
    stackOwnerType("AWS CDK generated stack", []),
    "cdk",
  );

  assert.equal(
    stackOwnerType("regular infrastructure", [
      { Key: "environment", Value: "production" },
    ]),
    "cloudformation",
  );
});

test("owner matching tolerates case and trailing-dot differences", () => {
  const ownership = new Map<string, any>();

  ownership.set("example.com", {
    type: "cloudformation",
    id: "stack-1",
    name: "example-stack",
    logicalId: "DnsRecord",
    resourceType: "AWS::Route53::RecordSet",
  });

  assert.deepEqual(
    ownerFor("Example.COM.", ownership),
    {
      type: "cloudformation",
      id: "stack-1",
      name: "example-stack",
      logicalId: "DnsRecord",
    },
  );
});

test("discovered resources are external only when a stack owner matches", () => {
  const ownership = new Map<string, any>();

  ownership.set("existing-bucket", {
    type: "cdk",
    id: "stack-1",
    name: "cdk-stack",
    logicalId: "Bucket",
    resourceType: "AWS::S3::Bucket",
  });

  const external = discovered(
    {
      id: "s3:existing-bucket",
      service: "s3",
      resourceType: "AWS::S3::Bucket",
      name: "existing-bucket",
      physicalId: "existing-bucket",
      region: "ap-southeast-2",
    },
    ownership,
  );

  assert.equal(external.ownership, "external");
  assert.equal(external.owner?.type, "cdk");
  assert.equal(external.owner?.logicalId, "Bucket");

  const observed = discovered(
    {
      id: "s3:unmanaged-bucket",
      service: "s3",
      resourceType: "AWS::S3::Bucket",
      name: "unmanaged-bucket",
      physicalId: "unmanaged-bucket",
      region: "ap-southeast-2",
    },
    ownership,
  );

  assert.equal(observed.ownership, "observed");
  assert.equal(observed.owner, undefined);
});
