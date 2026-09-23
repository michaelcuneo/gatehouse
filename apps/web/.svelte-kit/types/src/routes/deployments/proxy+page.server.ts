// @ts-nocheck
import type { PageServerLoad } from './$types';

import { listResources } from '@gatehouse/db';

export const load = async () => {
  const resources = listResources();

  return {
    deployables: resources.filter((resource) =>
      resource.kind === 'service' || resource.kind === 'static_site'
    )
  };
};
;null as any as PageServerLoad;