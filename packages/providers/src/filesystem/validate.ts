import path from "node:path";

import { ROOT_DIR } from "@gatehouse/runtime";
import type {
  Resource,
  StaticSiteResource,
  StorageBucketResource,
} from "@gatehouse/types";

function resolvePath(value: string): string {
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(ROOT_DIR, value);
}

function assertSafeManagedPath(value: string): void {
  const resolved = resolvePath(value);
  const root = path.parse(resolved).root;

  if (resolved === root || resolved === ROOT_DIR) {
    throw new Error(`Refusing to manage unsafe filesystem path "${resolved}"`);
  }
}

export function validateFilesystemResource(resource: Resource): void {
  if (resource.kind === "storage_bucket") {
    const storage = resource as StorageBucketResource;

    if (storage.spec.provider !== "local") {
      throw new Error(
        `Filesystem provider cannot manage storage provider "${storage.spec.provider}"`,
      );
    }

    if (!storage.spec.path.trim()) {
      throw new Error("Local storage path is required");
    }

    assertSafeManagedPath(storage.spec.path);
    return;
  }

  if (resource.kind === "static_site") {
    const site = resource as StaticSiteResource;

    if (!site.spec.buildDirectory.trim()) {
      throw new Error("Static site build directory is required");
    }

    if (!site.spec.outputDirectory.trim()) {
      throw new Error("Static site output directory is required");
    }

    assertSafeManagedPath(site.spec.outputDirectory);
    return;
  }

  throw new Error(
    `Filesystem provider cannot reconcile resource kind "${resource.kind}"`,
  );
}

export function filesystemPath(value: string): string {
  return resolvePath(value);
}
