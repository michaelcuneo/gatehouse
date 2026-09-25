import { initDatabase } from '@gatehouse/db';
import {
  checkAllResourceHealth,
  reconcileDueResources
} from '@gatehouse/reconciliation';
import { ensureRuntime } from '@gatehouse/runtime';

let initialized = false;
let healthTimer: ReturnType<typeof setInterval> | null = null;
let reconciliationTimer: ReturnType<typeof setInterval> | null = null;
let healthRunning = false;
let reconciliationRunning = false;

function seconds(
  name: string,
  fallback: number,
  minimum = 1
) {
  const configured = Number(process.env[name] ?? fallback);

  if (!Number.isFinite(configured) || configured <= 0) {
    return null;
  }

  return Math.max(configured, minimum);
}

function healthIntervalMs() {
  const configured = seconds(
    'GATEHOUSE_HEALTH_MONITOR_TICK_SECONDS',
    10,
    5
  );

  return configured === null ? null : configured * 1000;
}

function reconciliationIntervalMs() {
  const configured = seconds(
    'GATEHOUSE_RECONCILIATION_TICK_SECONDS',
    10,
    5
  );

  return configured === null ? null : configured * 1000;
}

function reconciliationOptions() {
  const errorRetry = seconds(
    'GATEHOUSE_RECONCILIATION_ERROR_RETRY_SECONDS',
    60
  );
  const unhealthyRetry = seconds(
    'GATEHOUSE_RECONCILIATION_UNHEALTHY_RETRY_SECONDS',
    30
  );
  const deployOnChange = seconds(
    'GATEHOUSE_DEPLOY_ON_CHANGE_SCAN_SECONDS',
    15
  );
  const staleReconcile = seconds(
    'GATEHOUSE_RECONCILIATION_STALE_SECONDS',
    300,
    5
  );

  return {
    errorRetryMs: (errorRetry ?? 60) * 1000,
    unhealthyRetryMs: (unhealthyRetry ?? 30) * 1000,
    deployOnChangeMs: (deployOnChange ?? 15) * 1000,
    staleReconcileMs: (staleReconcile ?? 300) * 1000
  };
}

function startHealthMonitor() {
  if (healthTimer) {
    return;
  }

  const interval = healthIntervalMs();

  if (!interval) {
    return;
  }

  const check = async () => {
    if (healthRunning || reconciliationRunning) {
      return;
    }

    healthRunning = true;

    try {
      await checkAllResourceHealth();
    } catch (cause) {
      console.error('GateHouse health monitor failed', cause);
    } finally {
      healthRunning = false;
    }
  };

  void check();

  healthTimer = setInterval(() => {
    void check();
  }, interval);
  healthTimer.unref?.();
}

function startReconciliationMonitor() {
  if (reconciliationTimer) {
    return;
  }

  const interval = reconciliationIntervalMs();

  if (!interval) {
    return;
  }

  const reconcile = async () => {
    if (reconciliationRunning || healthRunning) {
      return;
    }

    reconciliationRunning = true;

    try {
      const result = await reconcileDueResources(
        reconciliationOptions()
      );

      if (result.failed.length) {
        console.error(
          'GateHouse automatic reconciliation completed with failures',
          result.failed
        );
      }
    } catch (cause) {
      console.error(
        'GateHouse automatic reconciliation monitor failed',
        cause
      );
    } finally {
      reconciliationRunning = false;
    }
  };

  void reconcile();

  reconciliationTimer = setInterval(() => {
    void reconcile();
  }, interval);
  reconciliationTimer.unref?.();
}

export async function init() {
  if (initialized) {
    return;
  }

  await ensureRuntime();
  initDatabase();

  initialized = true;
  startReconciliationMonitor();
  startHealthMonitor();

  console.log('GateHouse runtime initialized');
}
