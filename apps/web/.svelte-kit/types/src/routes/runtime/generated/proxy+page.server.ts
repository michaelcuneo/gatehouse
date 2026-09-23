// @ts-nocheck
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

export const load = async () => {
  const groups = await Promise.all([
    listDirectory(GENERATED_NGINX_DIR).then((files) => ({
      name: 'nginx',
      directory: GENERATED_NGINX_DIR,
      files
    })),
    listDirectory(GENERATED_CERT_DIR).then((files) => ({
      name: 'certificates',
      directory: GENERATED_CERT_DIR,
      files
    })),
    listDirectory(GENERATED_STATE_DIR).then((files) => ({
      name: 'state',
      directory: GENERATED_STATE_DIR,
      files
    }))
  ]);

  return { groups };
};
;null as any as PageServerLoad;