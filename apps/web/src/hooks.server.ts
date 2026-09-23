import { initDatabase } from '@gatehouse/db';
import { checkAllResourceHealth } from '@gatehouse/reconciliation';
import { ensureRuntime } from '@gatehouse/runtime';

let initialized = false;
let healthTimer: ReturnType<typeof setInterval> | null = null;

function healthIntervalMs() {
  const configured = Number(
    process.env.GATEHOUSE_HEALTH_INTERVAL_SECONDS ?? 60
  );

  if (!Number.isFinite(configured) || configured <= 0) {
    return null;
  }

  return Math.max(configured, 10) * 1000;
}

function startHealthMonitor() {
  if (healthTimer) {
    return;
  }

  const interval = healthIntervalMs();

  if (!interval) {
    return;
  }

  const check = () => {
    void checkAllResourceHealth().catch((cause) => {
      console.error('GateHouse health monitor failed', cause);
    });
  };

  check();

  healthTimer = setInterval(check, interval);
  healthTimer.unref?.();
}

export async function init() {
  if (initialized) {
    return;
  }

  await ensureRuntime();
  initDatabase();

  initialized = true;
  startHealthMonitor();

  console.log('GateHouse runtime initialized');
}
