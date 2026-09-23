import type { ManagedStage } from '@gatehouse/core';

export function configuredLogGroups(stage: ManagedStage) {
  const names = new Set<string>();

  for (const selector of stage.selectors ?? []) {
    if (selector.kind !== 'log-group') continue;

    for (const name of selector.names ?? []) {
      if (name) names.add(name);
    }
  }

  if (stage.manifest?.type === 'inline') {
    for (const resource of Object.values(stage.manifest.value.resources)) {
      if (resource.type === 'log-group' && resource.name) {
        names.add(resource.name);
      }
    }
  }

  return [...names];
}
