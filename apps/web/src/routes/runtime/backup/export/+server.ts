import type { RequestHandler } from './$types';

import { exportGateHouseState } from '@gatehouse/db';

export const GET: RequestHandler = async () => {
  const state = exportGateHouseState();
  const timestamp = state.exportedAt
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .replace('Z', '');

  return new Response(
    JSON.stringify(state, null, 2),
    {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition':
          `attachment; filename="gatehouse-state-${timestamp}.json"`,
        'cache-control': 'no-store'
      }
    }
  );
};
