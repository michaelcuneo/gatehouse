import assert from "node:assert/strict";
import test from "node:test";

import { validateAcmResource } from "../packages/providers/src/acm/validate.ts";
import { validateDynamoDBResource } from "../packages/providers/src/dynamodb/validate.ts";
import { validateLambdaResource } from "../packages/providers/src/lambda/validate.ts";
import { validateS3Resource } from "../packages/providers/src/s3/validate.ts";

const context = {
  projectStages: [{}],
} as any;

const base = {
  id: "resource-1",
  name: "resource",
  version: 1,
  enabled: true,
  status: "ready",
  createdAt: "2026-09-26T00:00:00.000Z",
  updatedAt: "2026-09-26T00:00:00.000Z",
};

test("S3 validation rejects invalid bucket names and wrong resource kinds", () => {
  assert.throws(
    () =>
      validateS3Resource(
        {
          ...base,
          kind: "service",
          provider: "s3",
          spec: {},
        } as any,
        context,
      ),
    /cannot reconcile resource kind/i,
  );

  assert.throws(
    () =>
      validateS3Resource(
        {
          ...base,
          kind: "storage_bucket",
          provider: "s3",
          spec: {
            provider: "s3",
            bucket: "Invalid_Bucket",
            region: "ap-southeast-2",
          },
        } as any,
        context,
      ),
    /invalid S3 bucket name/i,
  );

  assert.throws(
    () =>
      validateS3Resource(
        {
          ...base,
          kind: "storage_bucket",
          provider: "s3",
          spec: {
            provider: "s3",
            bucket: "192.168.1.1",
            region: "ap-southeast-2",
          },
        } as any,
        context,
      ),
    /invalid S3 bucket name/i,
  );
});

test("ACM validation rejects incompatible certificate definitions", () => {
  assert.throws(
    () =>
      validateAcmResource(
        {
          ...base,
          kind: "certificate",
          provider: "acm",
          spec: {
            provider: "aws_acm",
            domains: [],
            validation: "dns",
          },
        } as any,
        context,
      ),
    /requires at least one domain/i,
  );

  assert.throws(
    () =>
      validateAcmResource(
        {
          ...base,
          kind: "certificate",
          provider: "acm",
          spec: {
            provider: "acme",
            domains: ["example.com"],
          },
        } as any,
        context,
      ),
    /cannot manage certificate provider/i,
  );
});

test("DynamoDB validation rejects unsafe key and provisioned capacity definitions", () => {
  assert.throws(
    () =>
      validateDynamoDBResource(
        {
          ...base,
          kind: "database_table",
          provider: "dynamodb",
          spec: {
            provider: "dynamodb",
            tableName: "table",
            region: "ap-southeast-2",
            partitionKey: {
              name: "id",
              type: "S",
            },
            sortKey: {
              name: "id",
              type: "S",
            },
            billingMode: "PAY_PER_REQUEST",
          },
        } as any,
        context,
      ),
    /sort key must differ/i,
  );

  assert.throws(
    () =>
      validateDynamoDBResource(
        {
          ...base,
          kind: "database_table",
          provider: "dynamodb",
          spec: {
            provider: "dynamodb",
            tableName: "table",
            region: "ap-southeast-2",
            partitionKey: {
              name: "id",
              type: "S",
            },
            billingMode: "PROVISIONED",
            readCapacity: 0,
            writeCapacity: 1,
          },
        } as any,
        context,
      ),
    /positive read and write capacity/i,
  );
});

test("Lambda validation rejects unsupported code and runtime limits", () => {
  assert.throws(
    () =>
      validateLambdaResource(
        {
          ...base,
          kind: "function",
          provider: "lambda",
          spec: {
            provider: "lambda",
            codeMode: "managed",
            functionName: "fn",
            region: "ap-southeast-2",
            memorySize: 128,
            timeout: 3,
          },
        } as any,
        context,
      ),
    /externally managed Lambda code packages/i,
  );

  assert.throws(
    () =>
      validateLambdaResource(
        {
          ...base,
          kind: "function",
          provider: "lambda",
          spec: {
            provider: "lambda",
            codeMode: "external",
            functionName: "fn",
            region: "ap-southeast-2",
            memorySize: 64,
            timeout: 3,
          },
        } as any,
        context,
      ),
    /memory must be at least 128 MB/i,
  );

  assert.throws(
    () =>
      validateLambdaResource(
        {
          ...base,
          kind: "function",
          provider: "lambda",
          spec: {
            provider: "lambda",
            codeMode: "external",
            functionName: "fn",
            region: "ap-southeast-2",
            memorySize: 128,
            timeout: 901,
          },
        } as any,
        context,
      ),
    /timeout must be between 1 and 900 seconds/i,
  );
});
