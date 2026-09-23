import { filesystemProvider } from "./filesystem";
import { nginxProvider } from "./nginx";

export const providers = {
  nginx: nginxProvider,
  filesystem: filesystemProvider,
};

export function getProvider(name: string) {
  return providers[name as keyof typeof providers];
}
