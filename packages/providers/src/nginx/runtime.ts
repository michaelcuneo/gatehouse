import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  removeNginxConfig as removeGeneratedNginxConfig,
  writeNginxConfig,
} from "@gatehouse/runtime";

const execFileAsync = promisify(execFile);

function commandPath(
  envName: "GATEHOUSE_NGINX_APPLY_COMMAND" | "GATEHOUSE_NGINX_REMOVE_COMMAND",
  fallback: string,
): string | null {
  const configured = process.env[envName]?.trim();

  if (configured === "none" || configured === "disabled") {
    return null;
  }

  return configured || fallback;
}

async function runPrivilegedHelper(
  command: string | null,
  args: string[],
): Promise<void> {
  if (!command) {
    return;
  }

  await execFileAsync("sudo", [command, ...args], {
    timeout: 30_000,
  });
}

export async function applyNginxConfig(
  resourceId: string,
  config: string,
): Promise<string> {
  const target = await writeNginxConfig(resourceId, config);
  const command = commandPath(
    "GATEHOUSE_NGINX_APPLY_COMMAND",
    "/usr/local/bin/route-manager-apply",
  );

  await runPrivilegedHelper(command, [target, `${resourceId}.conf`]);

  return target;
}

export async function removeNginxConfig(resourceId: string): Promise<void> {
  const target = await removeGeneratedNginxConfig(resourceId);
  const command = commandPath(
    "GATEHOUSE_NGINX_REMOVE_COMMAND",
    "/usr/local/bin/route-manager-remove",
  );

  await runPrivilegedHelper(command, [target, `${resourceId}.conf`]);
}
