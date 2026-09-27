let maintenance = false;
let activeOperations = 0;
let idleWaiters: Array<() => void> = [];

function resolveIdleWaiters() {
  if (activeOperations !== 0) {
    return;
  }

  const waiters = idleWaiters;
  idleWaiters = [];

  for (const resolve of waiters) {
    resolve();
  }
}

export function runtimeMaintenanceActive(): boolean {
  return maintenance;
}

export function beginRuntimeOperation(): (() => void) | null {
  if (maintenance) {
    return null;
  }

  activeOperations += 1;
  let ended = false;

  return () => {
    if (ended) {
      return;
    }

    ended = true;
    activeOperations = Math.max(activeOperations - 1, 0);
    resolveIdleWaiters();
  };
}

export async function withRuntimeMaintenance<T>(
  operation: () => Promise<T> | T,
): Promise<T> {
  if (maintenance) {
    throw new Error("GateHouse runtime maintenance is already active");
  }

  maintenance = true;

  try {
    if (activeOperations > 0) {
      await new Promise<void>((resolve) => {
        idleWaiters.push(resolve);
      });
    }

    return await operation();
  } finally {
    maintenance = false;
  }
}
