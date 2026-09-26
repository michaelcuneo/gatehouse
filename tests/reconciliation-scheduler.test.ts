import assert from "node:assert/strict";
import test from "node:test";

import { resourceIsDue } from "../packages/reconciliation/src/reconcileDueResources.ts";

const now = Date.parse("2026-09-26T12:00:00.000Z");
const timing = {
  errorRetryMs: 60_000,
  unhealthyRetryMs: 30_000,
  deployOnChangeMs: 15_000,
  staleReconcileMs: 300_000,
};

function resource(overrides: Record<string, unknown> = {}) {
  return {
    id: "resource-1",
    kind: "service",
    name: "resource",
    provider: "systemd",
    version: 1,
    enabled: true,
    status: "ready",
    createdAt: "2026-09-26T11:00:00.000Z",
    updatedAt: "2026-09-26T11:59:00.000Z",
    spec: {
      runtime: "node",
      workingDirectory: "/srv/app",
      startCommand: "node index.js",
      ports: [],
    },
    ...overrides,
  } as any;
}

test("pending resources reconcile immediately", () => {
  assert.equal(
    resourceIsDue(
      resource({ status: "pending" }),
      now,
      timing,
    ),
    true,
  );
});

test("error resources respect retry backoff", () => {
  assert.equal(
    resourceIsDue(
      resource({
        status: "error",
        runtime: {
          lastReconciledAt: "2026-09-26T11:59:30.000Z",
        },
      }),
      now,
      timing,
    ),
    false,
  );

  assert.equal(
    resourceIsDue(
      resource({
        status: "error",
        runtime: {
          lastReconciledAt: "2026-09-26T11:58:00.000Z",
        },
      }),
      now,
      timing,
    ),
    true,
  );
});

test("unhealthy resources respect retry backoff", () => {
  assert.equal(
    resourceIsDue(
      resource({
        runtime: {
          healthy: false,
          lastReconciledAt: "2026-09-26T11:59:45.000Z",
        },
      }),
      now,
      timing,
    ),
    false,
  );

  assert.equal(
    resourceIsDue(
      resource({
        runtime: {
          healthy: false,
          lastReconciledAt: "2026-09-26T11:59:00.000Z",
        },
      }),
      now,
      timing,
    ),
    true,
  );
});

test("stuck reconciling resources become due only after stale timeout", () => {
  assert.equal(
    resourceIsDue(
      resource({
        status: "reconciling",
        updatedAt: "2026-09-26T11:58:00.000Z",
      }),
      now,
      timing,
    ),
    false,
  );

  assert.equal(
    resourceIsDue(
      resource({
        status: "reconciling",
        updatedAt: "2026-09-26T11:50:00.000Z",
      }),
      now,
      timing,
    ),
    true,
  );
});

test("deploy-on-change static sites use their scan interval", () => {
  const site = {
    ...resource({
      kind: "static_site",
      provider: "s3",
      status: "ready",
      spec: {
        buildDirectory: "/tmp/build",
        deployOnChange: true,
      },
    }),
  };

  assert.equal(
    resourceIsDue(
      {
        ...site,
        runtime: {
          healthy: true,
          lastReconciledAt: "2026-09-26T11:59:50.000Z",
        },
      },
      now,
      timing,
    ),
    false,
  );

  assert.equal(
    resourceIsDue(
      {
        ...site,
        runtime: {
          healthy: true,
          lastReconciledAt: "2026-09-26T11:59:40.000Z",
        },
      },
      now,
      timing,
    ),
    true,
  );
});

test("disabled ready resources are not selected for routine reconciliation", () => {
  assert.equal(
    resourceIsDue(
      resource({
        enabled: false,
        status: "ready",
        runtime: {
          healthy: false,
          lastReconciledAt: "2026-09-26T11:00:00.000Z",
        },
      }),
      now,
      timing,
    ),
    false,
  );
});
