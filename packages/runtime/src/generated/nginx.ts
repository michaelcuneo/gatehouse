import fs from "node:fs/promises";
import path from "node:path";

import { GENERATED_NGINX_DIR } from "../paths";

function safeFilename(filename: string): string {
  const base = path.basename(filename);

  if (!base || base === "." || base === "..") {
    throw new Error("Invalid NGINX config filename");
  }

  return base.endsWith(".conf") ? base : `${base}.conf`;
}

export function nginxConfigPath(filename: string): string {
  return path.join(GENERATED_NGINX_DIR, safeFilename(filename));
}

export async function writeNginxConfig(
  filename: string,
  config: string,
): Promise<string> {
  await fs.mkdir(GENERATED_NGINX_DIR, { recursive: true });

  const target = nginxConfigPath(filename);
  await fs.writeFile(target, config, "utf8");

  return target;
}

export async function removeNginxConfig(filename: string): Promise<string> {
  const target = nginxConfigPath(filename);

  await fs.rm(target, { force: true });

  return target;
}
