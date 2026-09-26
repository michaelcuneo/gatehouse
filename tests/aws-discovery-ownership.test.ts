import assert from "node:assert/strict";
import test from "node:test";

import {
  discovered,
  mergeStackFallbackResources,
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


test("generic CloudFormation child inventory only fills unsupported discovery gaps", () => {
  const specific = [
    {
      id: "route53:record",
      service: "route53",
      resourceType: "AWS::Route53::RecordSet",
      name: "www.example.com.",
      physicalId: "WWW.Example.COM.",
      region: "global",
      ownership: "external",
    },
  ] as any[];

  const fallbacks = [
    {
      id: "cloudformation:record",
      service: "cloudformation",
      resourceType: "AWS::Route53::RecordSet",
      name: "DnsRecord",
      physicalId: "www.example.com",
      region: "ap-southeast-2",
      ownership: "external",
    },
    {
      id: "cloudformation:queue",
      service: "cloudformation",
      resourceType: "AWS::SQS::Queue",
      name: "WorkerQueue",
      physicalId:
        "https://sqs.ap-southeast-2.amazonaws.com/123456789012/worker",
      region: "ap-southeast-2",
      ownership: "external",
    },
  ] as any[];

  const merged = mergeStackFallbackResources(
    specific,
    fallbacks,
  );

  assert.deepEqual(
    merged.map((resource) => resource.id),
    ["route53:record", "cloudformation:queue"],
  );
});


test("native observability discovery suppresses duplicate stack fallbacks without hiding unsupported children", () => {
  const specific = [
    {
      id: "logs:ap-southeast-2:/aws/lambda/api",
      service: "logs",
      resourceType: "AWS::Logs::LogGroup",
      name: "/aws/lambda/api",
      physicalId: "/aws/lambda/api",
      region: "ap-southeast-2",
      ownership: "external",
    },
    {
      id: "cloudwatch:ap-southeast-2:alarm:api-errors",
      service: "cloudwatch",
      resourceType: "AWS::CloudWatch::Alarm",
      name: "api-errors",
      physicalId: "api-errors",
      region: "ap-southeast-2",
      ownership: "external",
    },
  ] as any[];

  const fallbacks = [
    {
      id: "cloudformation:log-group",
      service: "cloudformation",
      resourceType: "AWS::Logs::LogGroup",
      name: "ApiLogGroup",
      physicalId: "/aws/lambda/api",
      region: "ap-southeast-2",
      ownership: "external",
    },
    {
      id: "cloudformation:alarm",
      service: "cloudformation",
      resourceType: "AWS::CloudWatch::Alarm",
      name: "ApiAlarm",
      physicalId: "api-errors",
      region: "ap-southeast-2",
      ownership: "external",
    },
    {
      id: "cloudformation:dashboard",
      service: "cloudformation",
      resourceType: "AWS::CloudWatch::Dashboard",
      name: "OperationsDashboard",
      physicalId: "operations",
      region: "ap-southeast-2",
      ownership: "external",
    },
  ] as any[];

  const merged = mergeStackFallbackResources(
    specific,
    fallbacks,
  );

  assert.deepEqual(
    merged.map((resource) => resource.id),
    [
      "logs:ap-southeast-2:/aws/lambda/api",
      "cloudwatch:ap-southeast-2:alarm:api-errors",
      "cloudformation:dashboard",
    ],
  );
});


test("CloudFormation ownership resolves identical regional physical IDs by region", () => {
  const ownership = new Map<string, any>();

  ownership.set("shared-function", [
    {
      type: "cloudformation",
      id: "stack-sydney",
      name: "sydney-stack",
      logicalId: "Function",
      resourceType: "AWS::Lambda::Function",
      region: "ap-southeast-2",
    },
    {
      type: "cloudformation",
      id: "stack-virginia",
      name: "virginia-stack",
      logicalId: "Function",
      resourceType: "AWS::Lambda::Function",
      region: "us-east-1",
    },
  ]);

  assert.deepEqual(
    ownerFor(
      "shared-function",
      ownership,
      {
        resourceType: "AWS::Lambda::Function",
        region: "ap-southeast-2",
      },
    ),
    {
      type: "cloudformation",
      id: "stack-sydney",
      name: "sydney-stack",
      logicalId: "Function",
    },
  );

  assert.deepEqual(
    ownerFor(
      "shared-function",
      ownership,
      {
        resourceType: "AWS::Lambda::Function",
        region: "us-east-1",
      },
    ),
    {
      type: "cloudformation",
      id: "stack-virginia",
      name: "virginia-stack",
      logicalId: "Function",
    },
  );

  assert.equal(
    ownerFor(
      "shared-function",
      ownership,
      {
        resourceType: "AWS::Lambda::Function",
        region: "eu-west-1",
      },
    ),
    undefined,
  );
});

test("ownership matching prefers resource type before accepting a physical-id collision", () => {
  const ownership = new Map<string, any>();

  ownership.set("shared-name", [
    {
      type: "cloudformation",
      id: "stack-table",
      name: "table-stack",
      logicalId: "Table",
      resourceType: "AWS::DynamoDB::Table",
      region: "ap-southeast-2",
    },
    {
      type: "cloudformation",
      id: "stack-function",
      name: "function-stack",
      logicalId: "Function",
      resourceType: "AWS::Lambda::Function",
      region: "ap-southeast-2",
    },
  ]);

  assert.deepEqual(
    ownerFor(
      "shared-name",
      ownership,
      {
        resourceType: "AWS::DynamoDB::Table",
        region: "ap-southeast-2",
      },
    ),
    {
      type: "cloudformation",
      id: "stack-table",
      name: "table-stack",
      logicalId: "Table",
    },
  );
});

test("fallback de-duplication keeps same-named regional resources in different regions", () => {
  const specific = [
    {
      id: "lambda:ap-southeast-2:shared",
      service: "lambda",
      resourceType: "AWS::Lambda::Function",
      name: "shared",
      physicalId: "shared",
      region: "ap-southeast-2",
      ownership: "external",
    },
  ] as any[];

  const fallbacks = [
    {
      id: "cloudformation:ap-southeast-2:shared",
      service: "cloudformation",
      resourceType: "AWS::Lambda::Function",
      name: "Function",
      physicalId: "shared",
      region: "ap-southeast-2",
      ownership: "external",
    },
    {
      id: "cloudformation:us-east-1:shared",
      service: "cloudformation",
      resourceType: "AWS::Lambda::Function",
      name: "Function",
      physicalId: "shared",
      region: "us-east-1",
      ownership: "external",
    },
  ] as any[];

  assert.deepEqual(
    mergeStackFallbackResources(
      specific,
      fallbacks,
    ).map((resource) => resource.id),
    [
      "lambda:ap-southeast-2:shared",
      "cloudformation:us-east-1:shared",
    ],
  );
});
