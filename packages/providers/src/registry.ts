import type { ResourceProvider } from "@gatehouse/types";
import type { Provider } from "./types";
import { acmProvider } from "./acm";
import { filesystemProvider } from "./filesystem";
import { dynamodbProvider } from "./dynamodb";
import { nginxProvider } from "./nginx";
import { lambdaProvider } from "./lambda";
import { route53Provider } from "./route53";
import { s3Provider } from "./s3";
import { systemdProvider } from "./systemd";

export const providers = {
  nginx: nginxProvider,
  filesystem: filesystemProvider,
  systemd: systemdProvider,
  route53: route53Provider,
  s3: s3Provider,
  acm: acmProvider,
  dynamodb: dynamodbProvider,
  lambda: lambdaProvider,
} satisfies Record<ResourceProvider, Provider>;

export function getProvider(
  name: ResourceProvider,
): Provider {
  return providers[name];
}
