import fs from 'node:fs/promises';
import path from 'node:path';

import type { PageServerLoad } from './$types';

import {
  GENERATED_CERT_DIR,
  GENERATED_NGINX_DIR,
  GENERATED_STATE_DIR
} from '@gatehouse/runtime';

async function listDirectory(directory: string) {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });

    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .map(async (entry) => {
          const fullPath = path.join(directory, entry.name);
          const stat = await fs.stat(fullPath);

          return {
            name: entry.name,
            path: fullPath,
            size: stat.size,
            modifiedAt: stat.mtime.toISOString()
          };
        })
    );

    return files.sort((a, b) => a.name.localeCompare(b.name));
  } catch (cause) {
    const code =
      cause && typeof cause === 'object' && 'code' in cause
        ? String(cause.code)
        : '';

    if (code === 'ENOENT') return [];

    throw cause;
  }
}

export const load: PageServerLoad = async () => {
  const [nginx, certificates, state] = await Promise.all([
    listDirectory(GENERATED_NGINX_DIR),
    listDirectory(GENERATED_CERT_DIR),
    listDirectory(GENERATED_STATE_DIR)
  ]);

  return {
    directories: {
      nginx: GENERATED_NGINX_DIR,
      certificates: GENERATED_CERT_DIR,
      state: GENERATED_STATE_DIR
    },
    generated: {
      nginx,
      certificates,
      state
    }
  };
};
