import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  removeServiceUnit,
  serviceUnitFilename,
  writeServiceUnit,
} from "@gatehouse/runtime";

const execFileAsync = promisify(execFile);

function helper(
  envName: "GATEHOUSE_SERVICE_APPLY_COMMAND" | "GATEHOUSE_SERVICE_REMOVE_COMMAND",
  fallback: string,
): string | null {
  const configured = process.env[envName]?.trim();

  if (configured === "none" || configured === "disabled") {
    return null;
  }

  return configured || fallback;
}

async function runHelper(command: string | null, args: string[]): Promise<void> {
  if (!command) return;

  await execFileAsync("sudo", [command, ...args], {
    timeout: 30_000,
  });
}

export async function applyServiceUnit(
  resourceId: string,
  unit: string,
): Promise<void> {
  const target = await writeServiceUnit(resourceId, unit);
  const filename = serviceUnitFilename(resourceId);

  await runHelper(
    helper(
      "GATEHOUSE_SERVICE_APPLY_COMMAND",
      "/usr/local/bin/gatehouse-service-apply",
    ),
    [target, filename],
  );
}

export async function removeManagedService(resourceId: string): Promise<void> {
  const target = await removeServiceUnit(resourceId);
  const filename = serviceUnitFilename(resourceId);

  await runHelper(
    helper(
      "GATEHOUSE_SERVICE_REMOVE_COMMAND",
      "/usr/local/bin/gatehouse-service-remove",
    ),
    [target, filename],
  );
}
