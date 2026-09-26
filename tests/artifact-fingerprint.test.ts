import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { fingerprintStaticSiteBuild } from "../packages/reconciliation/src/artifactFingerprint.ts";

test("static site artifact fingerprints are deterministic and content-sensitive", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "gatehouse-fingerprint-test-"),
  );

  try {
    fs.mkdirSync(path.join(root, "assets"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(root, "index.html"),
      "<h1>GateHouse</h1>",
      "utf8",
    );
    fs.writeFileSync(
      path.join(root, "assets", "app.js"),
      "console.log('one');",
      "utf8",
    );

    const resource = {
      id: "site-1",
      kind: "static_site",
      name: "site",
      provider: "s3",
      version: 1,
      enabled: true,
      status: "ready",
      createdAt: "2026-09-26T00:00:00.000Z",
      updatedAt: "2026-09-26T00:00:00.000Z",
      spec: {
        buildDirectory: root,
        deployOnChange: true,
      },
    } as const;

    const first = await fingerprintStaticSiteBuild(
      resource as any,
    );
    const second = await fingerprintStaticSiteBuild(
      resource as any,
    );

    assert.match(first, /^sha256:[a-f0-9]{64}$/);
    assert.equal(second, first);

    fs.writeFileSync(
      path.join(root, "assets", "app.js"),
      "console.log('two');",
      "utf8",
    );

    const changed = await fingerprintStaticSiteBuild(
      resource as any,
    );

    assert.notEqual(changed, first);

    fs.writeFileSync(
      path.join(root, "assets", "app.js"),
      "console.log('one');",
      "utf8",
    );

    const restored = await fingerprintStaticSiteBuild(
      resource as any,
    );

    assert.equal(restored, first);
  } finally {
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
  }
});
