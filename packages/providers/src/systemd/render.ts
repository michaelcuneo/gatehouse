import path from "node:path";

import { ROOT_DIR } from "@gatehouse/runtime";
import type { ServiceResource } from "@gatehouse/types";

function resolveWorkingDirectory(value: string): string {
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(ROOT_DIR, value);
}

function quoteSystemd(value: string): string {
  return `"${value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("%", "%%")}"`;
}

export function renderServiceUnit(resource: ServiceResource): string {
  const spec = resource.spec;
  const workingDirectory = resolveWorkingDirectory(spec.workingDirectory);

  const lines = [
    "[Unit]",
    `Description=GateHouse service: ${resource.name}`,
    "After=network.target",
    "",
    "[Service]",
    "Type=simple",
    `WorkingDirectory=${quoteSystemd(workingDirectory)}`,
    `ExecStart=/bin/sh -lc ${quoteSystemd(spec.startCommand)}`,
    "Restart=on-failure",
    "RestartSec=3",
  ];

  if (spec.envFile) {
    const envFile = path.isAbsolute(spec.envFile)
      ? path.normalize(spec.envFile)
      : path.resolve(ROOT_DIR, spec.envFile);

    lines.push(`EnvironmentFile=-${quoteSystemd(envFile)}`);
  }

  lines.push(
    "",
    "[Install]",
    "WantedBy=multi-user.target",
    "",
  );

  return lines.join("\n");
}
