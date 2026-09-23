import { nginxProvider } from "./nginx";

export const providers = {
  nginx: nginxProvider,
};

export function getProvider(name: string) {
  return providers[name as keyof typeof providers];
}
