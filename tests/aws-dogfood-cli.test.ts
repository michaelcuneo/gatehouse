import assert from "node:assert/strict";
import test from "node:test";

import {
  parseAwsDogfoodArgs,
} from "../scripts/aws-dogfood.ts";

test("AWS dogfood CLI requires explicit project and stage", () => {
  assert.throws(
    () => parseAwsDogfoodArgs([]),
    /--project is required/i,
  );

  assert.throws(
    () =>
      parseAwsDogfoodArgs([
        "--project",
        "example",
      ]),
    /--stage is required/i,
  );
});

test("AWS dogfood CLI parses explicit read-only target and output", () => {
  assert.deepEqual(
    parseAwsDogfoodArgs([
      "--project",
      "example",
      "--stage",
      "production",
      "--out",
      "/tmp/report.json",
    ]),
    {
      project: "example",
      stage: "production",
      out: "/tmp/report.json",
      help: false,
    },
  );
});

test("AWS dogfood CLI rejects unknown and valueless arguments", () => {
  assert.throws(
    () =>
      parseAwsDogfoodArgs([
        "--project",
        "example",
        "--stage",
      ]),
    /missing value for --stage/i,
  );

  assert.throws(
    () =>
      parseAwsDogfoodArgs([
        "--project",
        "example",
        "--stage",
        "production",
        "--mutate",
      ]),
    /unknown argument/i,
  );
});

test("AWS dogfood CLI help requires no project or stage", () => {
  assert.deepEqual(
    parseAwsDogfoodArgs(["--help"]),
    {
      project: "",
      stage: "",
      help: true,
    },
  );
});
