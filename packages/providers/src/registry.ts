import { filesystemProvider } from "./filesystem";
import { nginxProvider } from "./nginx";
import { route53Provider } from "./route53";
import { s3Provider } from "./s3";
import { systemdProvider } from "./systemd";

export const providers = {
  nginx: nginxProvider,
  filesystem: filesystemProvider,
  systemd: systemdProvider,
  route53: route53Provider,
  s3: s3Provider,
};

export function getProvider(name: string) {
  return providers[name as keyof typeof providers];
}
