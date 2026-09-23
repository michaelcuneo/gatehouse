// @ts-nocheck
import type { PageServerLoad } from './$types';

import { listManagedProjects, listResources } from '@gatehouse/db';

export const load = async () => {
  return {
    projects: listManagedProjects(),
    localErrors: listResources().filter((resource) => resource.status === 'error')
  };
};
;null as any as PageServerLoad;