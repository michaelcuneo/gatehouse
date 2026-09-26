import fs from "node:fs";
import path from "node:path";

function isGateHouseRoot(directory: string): boolean {
  const workspace = path.join(directory, "pnpm-workspace.yaml");
  const packageJson = path.join(directory, "package.json");

  if (!fs.existsSync(workspace) || !fs.existsSync(packageJson)) {
    return false;
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(packageJson, "utf8")) as {
      name?: string;
    };

    return pkg.name === "gatehouse";
  } catch {
    return false;
  }
}

function resolveRootDirectory(): string {
  const configured = process.env.GATEHOUSE_ROOT?.trim();

  if (configured) {
    return path.resolve(configured);
  }

  let current = process.cwd();

  while (true) {
    if (isGateHouseRoot(current)) {
      return current;
    }

    const parent = path.dirname(current);

    if (parent === current) {
      return process.cwd();
    }

    current = parent;
  }
}

export const ROOT_DIR = resolveRootDirectory();

export const RUNTIME_DIR = path.join(ROOT_DIR, "runtime");

export const GENERATED_DIR = path.join(RUNTIME_DIR, "generated");

export const GENERATED_NGINX_DIR = path.join(GENERATED_DIR, "nginx");

export const GENERATED_CERT_DIR = path.join(GENERATED_DIR, "certs");

export const GENERATED_STATE_DIR = path.join(GENERATED_DIR, "state");

export const DATA_DIR = path.join(ROOT_DIR, "data");
