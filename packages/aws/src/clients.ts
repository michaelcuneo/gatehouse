import { ACMClient } from "@aws-sdk/client-acm";
import { CloudFrontClient } from "@aws-sdk/client-cloudfront";
import { CloudFormationClient } from "@aws-sdk/client-cloudformation";
import { CloudWatchClient } from "@aws-sdk/client-cloudwatch";
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { Route53Client } from "@aws-sdk/client-route-53";
import { S3Client } from "@aws-sdk/client-s3";
import { STSClient } from "@aws-sdk/client-sts";

import type { ManagedStage } from "@gatehouse/core";

import { credentialsForStage } from "./credentials";

function configForStage(stage: ManagedStage, region = stage.primaryRegion) {
  return {
    region,
    credentials: credentialsForStage(stage),
  };
}

export function awsClientsForStage(
  stage: ManagedStage,
  region = stage.primaryRegion,
) {
  const config = configForStage(stage, region);

  return {
    acm: new ACMClient(config),
    cloudFormation: new CloudFormationClient(config),
    cloudFront: new CloudFrontClient({
      ...config,
      region: "us-east-1",
    }),
    cloudWatch: new CloudWatchClient(config),
    logs: new CloudWatchLogsClient(config),
    dynamoDB: new DynamoDBClient(config),
    lambda: new LambdaClient(config),
    route53: new Route53Client(config),
    s3: new S3Client(config),
    sts: new STSClient(config),
  };
}
