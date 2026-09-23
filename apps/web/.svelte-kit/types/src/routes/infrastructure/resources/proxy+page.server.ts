// @ts-nocheck
import type { PageServerLoad } from './$types';

import { listResources } from '@gatehouse/db';

export const load = async () => {
  return {
    resources: listResources()
  };
};
;null as any as PageServerLoad;