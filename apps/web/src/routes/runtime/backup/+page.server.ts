import fs from 'node:fs';
import path from 'node:path';

import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import {
  exportGateHouseState,
  gateHouseStateCounts,
  restoreGateHouseState,
  validateGateHouseStateExport
} from '@gatehouse/db';
import {
  DATA_DIR,
  withRuntimeMaintenance
} from '@gatehouse/runtime';

const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
const RESTORE_CONFIRMATION = 'RESTORE GATEHOUSE STATE';

async function uploadedBackup(request: Request) {
  const form = await request.formData();
  const file = form.get('backup');

  if (!(file instanceof File) || file.size === 0) {
    throw new Error('Select a GateHouse state JSON backup.');
  }

  if (file.size > MAX_BACKUP_BYTES) {
    throw new Error('Backup exceeds the 50 MB restore limit.');
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(await file.text());
  } catch (cause) {
    throw new Error(
      'Backup is not valid JSON: ' +
        (cause instanceof Error ? cause.message : String(cause))
    );
  }

  return {
    form,
    state: validateGateHouseStateExport(parsed)
  };
}

function countsFor(
  state: ReturnType<typeof validateGateHouseStateExport>
) {
  return Object.fromEntries(
    Object.entries(state.tables).map(([table, rows]) => [
      table,
      rows.length
    ])
  );
}

function writePreRestoreBackup() {
  const state = exportGateHouseState();
  const directory = path.join(DATA_DIR, 'backups');
  const timestamp = state.exportedAt
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .replace('Z', '');
  const filename = `gatehouse-pre-restore-${timestamp}.json`;
  const filepath = path.join(directory, filename);

  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    filepath,
    JSON.stringify(state, null, 2),
    'utf8'
  );

  return filepath;
}

export const load: PageServerLoad = async () => {
  return {
    counts: gateHouseStateCounts(),
    restoreConfirmation: RESTORE_CONFIRMATION
  };
};

export const actions: Actions = {
  validate: async ({ request }) => {
    try {
      const { state } = await uploadedBackup(request);

      return {
        success: true,
        action: 'validate',
        exportedAt: state.exportedAt,
        counts: countsFor(state)
      };
    } catch (cause) {
      return fail(400, {
        error: cause instanceof Error
          ? cause.message
          : String(cause)
      });
    }
  },

  restore: async ({ request }) => {
    try {
      const { form, state } = await uploadedBackup(request);
      const confirmation = String(
        form.get('confirmation') ?? ''
      ).trim();

      if (confirmation !== RESTORE_CONFIRMATION) {
        return fail(400, {
          error:
            'Type the exact restore confirmation phrase before replacing local GateHouse state.'
        });
      }

      let rollbackPath = '';

      await withRuntimeMaintenance(async () => {
        rollbackPath = writePreRestoreBackup();
        restoreGateHouseState(state);
      });

      return {
        success: true,
        action: 'restore',
        exportedAt: state.exportedAt,
        rollbackPath
      };
    } catch (cause) {
      return fail(409, {
        error: cause instanceof Error
          ? cause.message
          : String(cause)
      });
    }
  }
};
