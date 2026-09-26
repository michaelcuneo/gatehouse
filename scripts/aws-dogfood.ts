import fs from "node:fs";
import path from "node:path";

import {
  awsStageAdoptionEnabled,
  buildAwsDiscoveryDogfoodReport,
  discoverAwsStage,
} from "../packages/aws/src/index.ts";
import {
  getManagedStage,
  initDatabase,
  saveAwsDiscoverySnapshot,
} from "../packages/db/src/index.ts";
import {
  listImportedAwsResourcesForStage,
} from "../packages/resources/src/index.ts";
import {
  DATA_DIR,
  ensureRuntime,
} from "../packages/runtime/src/index.ts";

type CliOptions = {
  project: string;
  stage: string;
  out?: string;
  help: boolean;
};

function usage() {
  return [
    "GateHouse read-only AWS dogfood",
    "",
    "Usage:",
    "  pnpm dogfood:aws --project <project> --stage <stage> [--out <file>]",
    "",
    "The command:",
    "  - requires the stage to be enabled and in read-only adoption mode",
    "  - performs AWS discovery only",
    "  - saves the discovery snapshot locally",
    "  - writes a gatehouse-aws-discovery-report v2 JSON report",
    "  - exits non-zero when the discovery safety baseline has blockers",
    "  - never imports resources, changes ownership, or mutates AWS",
  ].join("\n");
}

export function parseAwsDogfoodArgs(
  argv: string[],
): CliOptions {
  const options: CliOptions = {
    project: "",
    stage: "",
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (
      argument === "--project" ||
      argument === "--stage" ||
      argument === "--out"
    ) {
      const value = argv[index + 1];

      if (!value || value.startsWith("-")) {
        throw new Error(
          `Missing value for ${argument}`,
        );
      }

      if (argument === "--project") {
        options.project = value;
      } else if (argument === "--stage") {
        options.stage = value;
      } else {
        options.out = value;
      }

      index += 1;
      continue;
    }

    throw new Error(
      `Unknown argument: ${argument}`,
    );
  }

  if (!options.help) {
    if (!options.project) {
      throw new Error("--project is required");
    }

    if (!options.stage) {
      throw new Error("--stage is required");
    }
  }

  return options;
}

function safePart(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "stage";
}

function reportPath(
  options: CliOptions,
  scannedAt: string,
): string {
  if (options.out) {
    return path.resolve(options.out);
  }

  const timestamp = scannedAt
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .replace("Z", "");

  return path.join(
    DATA_DIR,
    "reports",
    `gatehouse-aws-discovery-${safePart(options.project)}-${safePart(options.stage)}-${timestamp}.json`,
  );
}

function localImportMap(stageId: string) {
  return Object.fromEntries(
    listImportedAwsResourcesForStage(stageId)
      .map((resource) => [
        resource.metadata!.importedFrom!.discoveryId,
        {
          id: resource.id,
          kind: resource.kind,
          ownership:
            resource.metadata?.ownership?.mode ??
            (resource.metadata?.managed === false
              ? "external"
              : "gatehouse"),
          healthy:
            resource.runtime?.healthy ?? null,
          status: resource.status,
        },
      ]),
  );
}

export async function runAwsDogfood(
  options: CliOptions,
): Promise<{
  reportFile: string;
  ready: boolean;
  blockers: string[];
}> {
  await ensureRuntime();
  initDatabase();

  const context = getManagedStage(
    options.project,
    options.stage,
  );

  if (!context) {
    throw new Error(
      `Managed project stage "${options.project}/${options.stage}" was not found`,
    );
  }

  if (context.stage.enabled === false) {
    throw new Error(
      "Stage is disabled. Enable it before running AWS dogfood discovery.",
    );
  }

  if (awsStageAdoptionEnabled(context.stage)) {
    throw new Error(
      "Refusing read-only dogfood while AWS adoption is enabled. Set the stage back to read-only first.",
    );
  }

  const discovery = await discoverAwsStage(
    context.stage,
  );

  saveAwsDiscoverySnapshot(
    context.stage.id,
    discovery.scannedAt,
    discovery,
  );

  const report = buildAwsDiscoveryDogfoodReport({
    project: context.project,
    stage: context.stage,
    discovery,
    localImports: localImportMap(
      context.stage.id,
    ),
  });

  const output = reportPath(
    options,
    discovery.scannedAt,
  );

  fs.mkdirSync(
    path.dirname(output),
    {
      recursive: true,
    },
  );

  fs.writeFileSync(
    output,
    JSON.stringify(report, null, 2),
    "utf8",
  );

  return {
    reportFile: output,
    ready:
      report.discovery.dogfoodReadiness.ready,
    blockers:
      report.discovery.dogfoodReadiness.blockers,
  };
}

async function main() {
  let options: CliOptions;

  try {
    options = parseAwsDogfoodArgs(
      process.argv.slice(2),
    );
  } catch (cause) {
    console.error(
      cause instanceof Error
        ? cause.message
        : String(cause),
    );
    console.error("");
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    console.log(usage());
    return;
  }

  try {
    const result = await runAwsDogfood(
      options,
    );

    console.log(
      `AWS dogfood report: ${result.reportFile}`,
    );

    if (result.ready) {
      console.log(
        "Read-only AWS dogfood baseline passed.",
      );
      return;
    }

    console.error(
      "Read-only AWS dogfood baseline has blockers:",
    );

    for (const blocker of result.blockers) {
      console.error(`- ${blocker}`);
    }

    process.exitCode = 1;
  } catch (cause) {
    console.error(
      cause instanceof Error
        ? cause.message
        : String(cause),
    );
    process.exitCode = 1;
  }
}

if (
  import.meta.url ===
  new URL(
    process.argv[1] ?? "",
    "file://",
  ).href
) {
  await main();
}
