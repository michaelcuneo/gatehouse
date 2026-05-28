import fs from "node:fs/promises";

import {
  GENERATED_DIR,
  GENERATED_NGINX_DIR,
  GENERATED_CERT_DIR,
  GENERATED_STATE_DIR,
  DATA_DIR,
} from "./paths";

export async function ensureRuntime() {
  await fs.mkdir(GENERATED_DIR, { recursive: true });

  await fs.mkdir(GENERATED_NGINX_DIR, { recursive: true });

  await fs.mkdir(GENERATED_CERT_DIR, { recursive: true });

  await fs.mkdir(GENERATED_STATE_DIR, { recursive: true });

  await fs.mkdir(DATA_DIR, {
    recursive: true,
  });
}
