import type { Resource } from "@gatehouse/types";

import {
  deployDirectory,
  ensureDirectory,
  removeEmptyDirectory,
  removeManagedDirectory,
} from "./runtime";
import {
  filesystemPath,
  validateFilesystemResource,
} from "./validate";

export async function reconcileFilesystemResource(
  resource: Resource,
): Promise<void> {
  validateFilesystemResource(resource);

  if (resource.kind === "storage_bucket") {
    if (resource.spec.provider !== "local") {
      throw new Error("Filesystem storage must use the local provider");
    }

    await ensureDirectory(filesystemPath(resource.spec.path));
    return;
  }

  if (resource.kind === "static_site") {
    await deployDirectory(
      filesystemPath(resource.spec.buildDirectory),
      filesystemPath(resource.spec.outputDirectory),
    );
    return;
  }

  throw new Error(
    `Filesystem provider cannot reconcile resource kind "${resource.kind}"`,
  );
}

export async function destroyFilesystemResource(
  resource: Resource,
): Promise<void> {
  validateFilesystemResource(resource);

  if (resource.kind === "storage_bucket") {
    if (resource.spec.provider !== "local") return;

    const directory = filesystemPath(resource.spec.path);

    if (resource.metadata?.managed === true) {
      await removeEmptyDirectory(directory);
    }

    return;
  }

  if (resource.kind === "static_site") {
    if (resource.metadata?.managed === true) {
      await removeManagedDirectory(
        filesystemPath(resource.spec.outputDirectory),
      );
    }

    return;
  }
}
