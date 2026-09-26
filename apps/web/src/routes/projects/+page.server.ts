import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import { defaultProjectCapabilities } from '@gatehouse/core';
import { assertAwsStageAccess } from '@gatehouse/aws';
import {
  deleteManagedProject,
  getManagedProject,
  listManagedProjects,
  saveManagedProject
} from '@gatehouse/db';

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
                sourceIdentity: 'gatehouse'
              }
            : {
                mode: 'default'
              },
          capabilities: {
            ...defaultProjectCapabilities,
            diagnostics: Boolean(diagnosticsProfile)
          },
          adoptionMode: 'read_only',
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
      success: true,
      action: 'registerProject'
    };
  },

  addStage: async ({ request }) => {
    const form = await request.formData();
    const projectId = text(form, 'projectId');
    const stageName = text(form, 'stageName');
    const accountId = text(form, 'stageAccountId');
    const primaryRegion =
      text(form, 'stageRegion') || 'ap-southeast-2';
    const roleArn = text(form, 'stageRoleArn');

    const project = getManagedProject(projectId);

    if (!project) {
      return fail(404, {
        error: 'Managed project not found.'
      });
    }

    if (
      !stageName ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(stageName)
    ) {
      return fail(400, {
        error:
          'Stage name must start with a letter or number and contain only letters, numbers, hyphens or underscores.'
      });
    }

    if (project.stages.some((stage) => stage.name === stageName)) {
      return fail(409, {
        error: 'That project already has a stage with this name.'
      });
    }

    if (!/^\d{12}$/.test(accountId)) {
      return fail(400, {
        error: 'AWS account ID must be 12 digits.'
      });
    }

    if (
      roleArn &&
      !/^arn:[^:]+:iam::\d{12}:role\/.+/.test(roleArn)
    ) {
      return fail(400, {
        error: 'Assume-role ARN is not valid.'
      });
    }

    const stage = {
      id: crypto.randomUUID(),
      name: stageName,
      accountId,
      primaryRegion,
      access: roleArn
        ? {
            mode: 'assume-role' as const,
            roleArn,
            sourceIdentity: 'gatehouse'
          }
        : {
            mode: 'default' as const
          },
      capabilities: {
        ...defaultProjectCapabilities
      },
      selectors: [],
      adoptionMode: 'read_only' as const,
      enabled: true
    };

    try {
      await assertAwsStageAccess(stage);
    } catch (cause) {
      return fail(409, {
        error:
          'Stage was not added because AWS access verification failed: ' +
          (cause instanceof Error ? cause.message : String(cause))
      });
    }

    saveManagedProject({
      ...project,
      updatedAt: new Date().toISOString(),
      stages: [...project.stages, stage]
    });

    return {
      success: true,
      action: 'addStage',
      projectId: project.id,
      stageName
    };
  },

  updateProject: async ({ request }) => {
    const form = await request.formData();
    const projectId = text(form, 'projectId');
    const name = text(form, 'projectName');
    const slug = text(form, 'projectSlug').toLowerCase();
    const diagnosticsProfile = text(form, 'projectDiagnosticsProfile');

    const project = getManagedProject(projectId);

    if (!project) {
      return fail(404, {
        error: 'Managed project not found.'
      });
    }

    if (!name || !slug) {
      return fail(400, {
        error: 'Project name and slug are required.'
      });
    }

    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      return fail(400, {
        error: 'Slug must contain lowercase letters, numbers and hyphens only.'
      });
    }

    const conflict = listManagedProjects().find(
      (candidate) =>
        candidate.id !== project.id &&
        candidate.slug === slug
    );

    if (conflict) {
      return fail(409, {
        error: 'Another project already uses that slug.'
      });
    }

    saveManagedProject({
      ...project,
      name,
      slug,
      diagnosticsProfile: diagnosticsProfile || undefined,
      updatedAt: new Date().toISOString()
    });

    return {
      success: true,
      action: 'updateProject',
      projectId: project.id
    };
  },

  removeProject: async ({ request }) => {
    const form = await request.formData();
    const projectId = text(form, 'projectId');
    const confirmation = text(form, 'confirmation');
    const project = getManagedProject(projectId);

    if (!project) {
      return fail(404, {
        error: 'Managed project not found.'
      });
    }

    if (project.stages.length) {
      return fail(409, {
        error:
          'Remove every project stage before deleting the project registry entry.'
      });
    }

    if (
      confirmation !== project.name &&
      confirmation !== project.slug
    ) {
      return fail(400, {
        error:
          'Type the exact project name or slug to remove it.'
      });
    }

    deleteManagedProject(project.id);

    return {
      success: true,
      action: 'removeProject',
      projectId: project.id
    };
  }
};
