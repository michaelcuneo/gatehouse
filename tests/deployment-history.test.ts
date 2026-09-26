import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("deployment history preserves latest successful artifact baseline", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "gatehouse-deployment-test-"),
  );

  process.env.GATEHOUSE_ROOT = root;

  try {
    const runtime = await import("../packages/runtime/src/index.ts");
    const db = await import("../packages/db/src/index.ts");

    await runtime.ensureRuntime();
    db.initDatabase();

    const base = {
      resourceId: "site-1",
      resourceName: "site",
      resourceKind: "static_site" as const,
      provider: "s3",
      resourceVersion: 1,
    };

    const first = db.startDeployment({
      ...base,
      id: "deploy-1",
      startedAt: "2026-09-26T00:00:00.000Z",
      artifactFingerprint: "sha256:first",
    });

    db.finishDeployment(first.id, {
      status: "succeeded",
      completedAt: "2026-09-26T00:01:00.000Z",
      artifactFingerprint: "sha256:first",
    });

    const skipped = db.startDeployment({
      ...base,
      id: "deploy-2",
      startedAt: "2026-09-26T01:00:00.000Z",
      artifactFingerprint: "sha256:first",
    });

    db.finishDeployment(skipped.id, {
      status: "skipped",
      completedAt: "2026-09-26T01:00:01.000Z",
      artifactFingerprint: "sha256:first",
      message: "Artifact unchanged",
    });

    assert.equal(
      db.getLatestSuccessfulDeployment("site-1")?.id,
      "deploy-2",
    );
    assert.equal(
      db.getLatestSuccessfulDeployment("site-1")
        ?.artifactFingerprint,
      "sha256:first",
    );

    const failed = db.startDeployment({
      ...base,
      id: "deploy-3",
      startedAt: "2026-09-26T02:00:00.000Z",
      artifactFingerprint: "sha256:second",
    });

    db.finishDeployment(failed.id, {
      status: "failed",
      completedAt: "2026-09-26T02:00:05.000Z",
      artifactFingerprint: "sha256:second",
      message: "Upload failed",
    });

    assert.equal(
      db.getLatestDeployment("site-1")?.id,
      "deploy-3",
    );
    assert.equal(
      db.getLatestDeployment("site-1")?.status,
      "failed",
    );

    assert.equal(
      db.getLatestSuccessfulDeployment("site-1")?.id,
      "deploy-2",
    );
    assert.equal(
      db.getLatestSuccessfulDeployment("site-1")
        ?.artifactFingerprint,
      "sha256:first",
    );

    const history = db.listDeployments({
      resourceId: "site-1",
    });

    assert.deepEqual(
      history.map((deployment) => deployment.id),
      ["deploy-3", "deploy-2", "deploy-1"],
    );
  } finally {
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
    delete process.env.GATEHOUSE_ROOT;
  }
});
