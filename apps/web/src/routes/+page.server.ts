import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import { defaultProjectCapabilities } from '@gatehouse/core';
import { listManagedProjects, saveManagedProject } from '@gatehouse/db';

function text(form: FormData, key: string) {
  return String(form.get(key) ?? '').trim();
}

export const load: PageServerLoad = async () => {
  return {
    projects: listManagedProjects()
  };
};

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await request.formData();

    const name = text(form, 'name');
    const slug = text(form, 'slug').toLowerCase();
    const stageName = text(form, 'stage') || 'production';
    const accountId = text(form, 'accountId');
    const region = text(form, 'region') || 'ap-southeast-2';
    const roleArn = text(form, 'roleArn');
    const diagnosticsProfile = text(form, 'diagnosticsProfile');
    const logGroups = text(form, 'logGroups')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (!name || !slug || !accountId) {
      return fail(400, {
        error: 'Name, slug and AWS account ID are required.'
      });
    }

    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      return fail(400, {
        error: 'Slug must contain lowercase letters, numbers and hyphens only.'
      });
    }

    if (!/^\d{12}$/.test(accountId)) {
      return fail(400, {
        error: 'AWS account ID must be 12 digits.'
      });
    }

    const now = new Date().toISOString();
    const projectId = crypto.randomUUID();

    saveManagedProject({
      id: projectId,
      slug,
      name,
      provider: 'aws',
      diagnosticsProfile: diagnosticsProfile || undefined,
      createdAt: now,
      updatedAt: now,
      stages: [
        {
          id: crypto.randomUUID(),
          name: stageName,
          accountId,
          primaryRegion: region,
          access: roleArn
            ? {
                mode: 'assume-role',
                roleArn,
                sourceIdentity: 'gatehouse-console'
              }
            : {
                mode: 'default'
              },
          capabilities: {
            ...defaultProjectCapabilities,
            diagnostics: Boolean(diagnosticsProfile)
          },
          selectors: logGroups.length
            ? [
                {
                  kind: 'log-group',
                  names: logGroups
                }
              ]
            : [],
          enabled: true
        }
      ]
    });

    return {
      success: true
    };
  }
};
