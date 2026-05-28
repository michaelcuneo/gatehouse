import path from "node:path";

export const ROOT_DIR = process.cwd();

export const RUNTIME_DIR = path.join(ROOT_DIR, "runtime");

export const GENERATED_DIR = path.join(RUNTIME_DIR, "generated");

export const GENERATED_NGINX_DIR = path.join(GENERATED_DIR, "nginx");

export const GENERATED_CERT_DIR = path.join(GENERATED_DIR, "certs");

export const GENERATED_STATE_DIR = path.join(GENERATED_DIR, "state");

export const DATA_DIR = path.join(ROOT_DIR, "data");
