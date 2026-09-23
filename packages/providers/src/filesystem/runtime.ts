import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDirectory(directory: string): Promise<void> {
  await fs.mkdir(directory, { recursive: true });
}

export async function deployDirectory(
  source: string,
  destination: string,
): Promise<void> {
  const sourceStat = await fs.stat(source);

  if (!sourceStat.isDirectory()) {
    throw new Error(`Static site build path is not a directory: ${source}`);
  }

  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination, { recursive: true });
  await fs.cp(source, destination, {
    recursive: true,
    force: true,
    errorOnExist: false,
  });
}

export async function removeManagedDirectory(directory: string): Promise<void> {
  await fs.rm(directory, { recursive: true, force: true });
}

export async function removeEmptyDirectory(directory: string): Promise<void> {
  try {
    await fs.rmdir(directory);
  } catch (cause) {
    const code =
      cause && typeof cause === "object" && "code" in cause
        ? String(cause.code)
        : "";

    if (code === "ENOENT") return;
    if (code === "ENOTEMPTY") return;

    throw cause;
  }
}
