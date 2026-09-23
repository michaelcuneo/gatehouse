import fs from "node:fs/promises";
import path from "node:path";

import {
  DATA_DIR,
  GENERATED_CERT_DIR,
  GENERATED_DIR,
  GENERATED_NGINX_DIR,
  GENERATED_STATE_DIR,
  ROOT_DIR,
} from "./paths";

async function migrateLegacyDatabase(): Promise<void> {
  const target = path.join(DATA_DIR, "app.db");

  try {
    await fs.access(target);
    return;
  } catch {
    // Continue and look for the pre-workspace-root database location.
  }

  const candidates = [
    path.join(process.cwd(), "data", "app.db"),
    path.join(ROOT_DIR, "apps", "web", "data", "app.db"),
  ];

  for (const candidate of candidates) {
    if (candidate === target) continue;

    try {
      await fs.access(candidate);
      await fs.copyFile(candidate, target);
      return;
    } catch {
      // Try the next legacy location.
    }
  }
}

export async function ensureRuntime(): Promise<void> {
  await fs.mkdir(GENERATED_DIR, { recursive: true });
  await fs.mkdir(GENERATED_NGINX_DIR, { recursive: true });
  await fs.mkdir(GENERATED_CERT_DIR, { recursive: true });
  await fs.mkdir(GENERATED_STATE_DIR, { recursive: true });
  await fs.mkdir(DATA_DIR, { recursive: true });

  await migrateLegacyDatabase();
}
