import { filesystemProvider } from "./filesystem";
import { nginxProvider } from "./nginx";
import { systemdProvider } from "./systemd";

export const providers = {
  nginx: nginxProvider,
  filesystem: filesystemProvider,
  systemd: systemdProvider,
};

export function getProvider(name: string) {
  return providers[name as keyof typeof providers];
}
