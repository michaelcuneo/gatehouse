import {
  GetQueryResultsCommand,
  StartQueryCommand,
  type ResultField,
} from "@aws-sdk/client-cloudwatch-logs";

import type { ManagedStage } from "@gatehouse/core";
import { awsClientsForStage } from "@gatehouse/aws";

import type { LogEvent, LogQuery } from "../types";
import { classifyLogLevel } from "./classify";

const DEFAULT_QUERY = `
fields @timestamp, @message, @log, @logStream
| sort @timestamp desc
`;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function field(row: ResultField[], name: string) {
  return row.find((item) => item.field === name)?.value;
}

function timestamp(value: string | undefined) {
  if (!value) return Date.now();

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

function normalizeRow(row: ResultField[]): LogEvent {
  const message = field(row, "@message") ?? "";
  const logGroup = field(row, "@log");
  const logStream = field(row, "@logStream");

  return {
    timestamp: timestamp(field(row, "@timestamp")),
    source: logGroup ?? logStream ?? "cloudwatch",
    logGroup,
    logStream,
    level: classifyLogLevel(message),
    message,
  };
}

export async function queryCloudWatchLogs(
  stage: ManagedStage,
  input: LogQuery,
): Promise<LogEvent[]> {
  if (input.logGroups.length === 0) return [];

  const { logs } = awsClientsForStage(stage);

  const query = [
    input.query?.trim() || DEFAULT_QUERY.trim(),
    `| limit ${Math.min(Math.max(input.limit ?? 200, 1), 1000)}`,
  ].join("\n");

  const started = await logs.send(
    new StartQueryCommand({
      logGroupNames: input.logGroups,
      startTime: Math.floor(input.startTime / 1000),
      endTime: Math.floor(input.endTime / 1000),
      queryString: query,
    }),
  );

  if (!started.queryId) {
    throw new Error("CloudWatch Logs Insights did not return a query ID");
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await logs.send(
      new GetQueryResultsCommand({
        queryId: started.queryId,
      }),
    );

    if (result.status === "Complete") {
      return (result.results ?? []).map(normalizeRow);
    }

    if (
      result.status === "Failed" ||
      result.status === "Cancelled" ||
      result.status === "Timeout"
    ) {
      throw new Error(
        `CloudWatch Logs Insights query ended with status ${result.status}`,
      );
    }

    await sleep(500);
  }

  throw new Error("CloudWatch Logs Insights query did not complete in time");
}
