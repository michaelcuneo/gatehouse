// @ts-nocheck
import type { PageServerLoad } from './$types';

import { listResources } from '@gatehouse/db';

export const load = async () => {
  const resources = listResources();
  const providers = new Map<
    string,
    {
      name: string;
      count: number;
      ready: number;
      errors: number;
      kinds: Set<string>;
    }
  >();

  for (const resource of resources) {
    const provider = providers.get(resource.provider) ?? {
      name: resource.provider,
      count: 0,
      ready: 0,
      errors: 0,
      kinds: new Set<string>()
    };

    provider.count += 1;
    provider.ready += resource.status === 'ready' ? 1 : 0;
    provider.errors += resource.status === 'error' ? 1 : 0;
    provider.kinds.add(resource.kind);

    providers.set(resource.provider, provider);
  }

  return {
    providers: [...providers.values()].map((provider) => ({
      ...provider,
      kinds: [...provider.kinds].sort()
    }))
  };
};
;null as any as PageServerLoad;