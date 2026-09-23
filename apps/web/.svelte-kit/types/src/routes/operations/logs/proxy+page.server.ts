// @ts-nocheck
import type { PageServerLoad } from './$types';

import { listManagedProjects } from '@gatehouse/db';

export const load = async () => {
  return {
    projects: listManagedProjects()
  };
};
;null as any as PageServerLoad;