import type { PageServerLoad } from './$types';

import {
  listAuditLogs,
  listResources
} from '@gatehouse/db';

export const load: PageServerLoad = async () => {
  const resources = listResources().sort((a, b) => {
    const aTime = String(a.runtime?.lastReconciledAt ?? a.updatedAt);
    const bTime = String(b.runtime?.lastReconciledAt ?? b.updatedAt);
    return bTime.localeCompare(aTime);
  });

  const resourceNames = Object.fromEntries(
    resources.map((resource) => [resource.id, resource.name])
  );

  return {
    resources,
    history: listAuditLogs({ limit: 100 }).map((entry) => ({
      ...entry,
      resourceName: resourceNames[entry.resourceId] ?? entry.resourceId
    }))
  };
};
