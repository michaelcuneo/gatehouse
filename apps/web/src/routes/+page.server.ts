import type { PageServerLoad } from './$types';

import {
  countResourcesByKind,
  countResourcesByStatus,
  listManagedProjects,
  listResources
} from '@gatehouse/db';

export const load: PageServerLoad = async () => {
  const resources = listResources();

  return {
    projects: listManagedProjects(),
    resourceCounts: countResourcesByKind(),
    statusCounts: countResourcesByStatus(),
    recentResources: resources
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 8)
  };
};
