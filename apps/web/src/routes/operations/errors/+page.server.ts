import type { PageServerLoad } from './$types';

import { listManagedProjects, listResources } from '@gatehouse/db';

export const load: PageServerLoad = async () => {
  return {
    projects: listManagedProjects(),
    localErrors: listResources().filter((resource) => resource.status === 'error')
  };
};
