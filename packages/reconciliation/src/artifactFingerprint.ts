import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { ROOT_DIR } from "@gatehouse/runtime";
import type { StaticSiteResource } from "@gatehouse/types";

function resolveBuildDirectory(value: string): string {
  return path.isAbsolute(value)
    ? path.normalize(value)
    : path.resolve(ROOT_DIR, value);
}

async function collectFiles(directory: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(current: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const absolute = path.join(current, entry.name);

      if (entry.isDirectory()) {
        await walk(absolute);
      } else if (entry.isFile()) {
        files.push(absolute);
      }
    }
  }

  await walk(directory);
  return files.sort();
}

export async function fingerprintStaticSiteBuild(
  resource: StaticSiteResource,
): Promise<string> {
  const root = resolveBuildDirectory(resource.spec.buildDirectory);
  const stat = await fs.stat(root);

  if (!stat.isDirectory()) {
    throw new Error(
      `Static site build path is not a directory: ${root}`,
    );
  }

  const hash = createHash("sha256");
  const files = await collectFiles(root);

  hash.update("gatehouse-static-site-artifact-v1\0");

  for (const filename of files) {
    const relative = path
      .relative(root, filename)
      .split(path.sep)
      .join("/");
    const body = await fs.readFile(filename);

    hash.update(relative);
    hash.update("\0");
    hash.update(String(body.byteLength));
    hash.update("\0");
    hash.update(body);
    hash.update("\0");
  }

  return `sha256:${hash.digest("hex")}`;
}
