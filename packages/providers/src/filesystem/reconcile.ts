import fs from "node:fs/promises";

import type { Resource } from "@gatehouse/types";
import type {
  ProviderContext,
  ProviderReconcileResult,
} from "../types";

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

async function directoryExists(directory: string): Promise<boolean> {
  try {
    const stat = await fs.stat(directory);
    return stat.isDirectory();
  } catch (cause) {
    const code =
      cause && typeof cause === "object" && "code" in cause
        ? String(cause.code)
        : "";

    if (code === "ENOENT") {
      return false;
    }

    throw cause;
  }
}

export async function reconcileFilesystemResource(
  resource: Resource,
  context: ProviderContext,
): Promise<ProviderReconcileResult | void> {
  validateFilesystemResource(resource);

  if (resource.kind === "storage_bucket") {
    if (resource.spec.provider !== "local") {
      throw new Error("Filesystem storage must use the local provider");
    }

    await ensureDirectory(filesystemPath(resource.spec.path));
    return;
  }

  if (resource.kind === "static_site") {
    if (!resource.spec.outputDirectory) {
      throw new Error("Filesystem static site output directory is required");
    }

    const destination = filesystemPath(resource.spec.outputDirectory);

    if (
      context.deployment?.skipArtifactTransfer &&
      await directoryExists(destination)
    ) {
      return {
        artifactTransferred: false,
        message: "Build artifact unchanged; existing filesystem deployment retained",
      };
    }

    await deployDirectory(
      filesystemPath(resource.spec.buildDirectory),
      destination,
    );

    return {
      artifactTransferred: true,
      message: context.deployment?.skipArtifactTransfer
        ? "Filesystem deployment was missing and has been restored"
        : "Static-site build copied to filesystem target",
    };
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
    if (resource.metadata?.managed === true && resource.spec.outputDirectory) {
      await removeManagedDirectory(
        filesystemPath(resource.spec.outputDirectory),
      );
    }

    return;
  }
}

export async function healthFilesystemResource(resource: Resource) {
  validateFilesystemResource(resource);

  const target =
    resource.kind === "storage_bucket"
      ? resource.spec.provider === "local"
        ? filesystemPath(resource.spec.path)
        : null
      : resource.kind === "static_site" && resource.spec.outputDirectory
        ? filesystemPath(resource.spec.outputDirectory)
        : null;

  if (!target) {
    return {
      healthy: false,
      message: "Filesystem resource does not resolve to a local path",
    };
  }

  try {
    const stat = await fs.stat(target);

    return {
      healthy: stat.isDirectory(),
      message: stat.isDirectory()
        ? `Managed directory exists: ${target}`
        : `Managed path is not a directory: ${target}`,
    };
  } catch (cause) {
    return {
      healthy: false,
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}
