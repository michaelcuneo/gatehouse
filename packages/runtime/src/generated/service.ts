import fs from "node:fs/promises";
import path from "node:path";

import { GENERATED_STATE_DIR } from "../paths";

function serviceFilename(resourceId: string): string {
  const base = path.basename(resourceId);

  if (!base || base === "." || base === "..") {
    throw new Error("Invalid service resource id");
  }

  return `gatehouse-${base}.service`;
}

export function serviceUnitPath(resourceId: string): string {
  return path.join(GENERATED_STATE_DIR, serviceFilename(resourceId));
}

export async function writeServiceUnit(
  resourceId: string,
  unit: string,
): Promise<string> {
  await fs.mkdir(GENERATED_STATE_DIR, { recursive: true });

  const target = serviceUnitPath(resourceId);
  await fs.writeFile(target, unit, "utf8");

  return target;
}

export async function removeServiceUnit(resourceId: string): Promise<string> {
  const target = serviceUnitPath(resourceId);
  await fs.rm(target, { force: true });

  return target;
}

export function serviceUnitFilename(resourceId: string): string {
  return serviceFilename(resourceId);
}
