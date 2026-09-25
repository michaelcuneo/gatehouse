import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import { assertAwsStageAccess } from '@gatehouse/aws';
import {
  getManagedStage,
  listResourcesForStage,
  saveManagedProject
} from '@gatehouse/db';

function text(form: FormData, key: string) {
  return String(form.get(key) ?? '').trim();
}

function checkbox(form: FormData, key: string) {
  return form.get(key) === 'on';
}

function regions(value: string, primaryRegion: string) {
  return [
    ...new Set(
      value
        .split(',')
        .map((region) => region.trim())
        .filter(
          (region) =>
            Boolean(region) && region !== primaryRegion
        )
    )
  ];
}

function stageContext(
  project: string,
  stage: string
) {
  const context = getManagedStage(project, stage);

  if (!context) {
    throw error(404, 'Managed project stage not found.');
  }

  return context;
}

export const load: PageServerLoad = async ({ params }) => {
  const context = stageContext(params.project, params.stage);
  const resources = listResourcesForStage(context.stage.id);

  try {
    const identity = await assertAwsStageAccess(context.stage);

    return {
      ...context,
      resources,
      aws: {
        ok: true as const,
        identity
      }
    };
  } catch (cause) {
    return {
      ...context,
      resources,
      aws: {
        ok: false as const,
        error: cause instanceof Error ? cause.message : String(cause)
      }
    };
  }
};

export const actions: Actions = {
  update: async ({ params, request }) => {
    const context = getManagedStage(params.project, params.stage);

    if (!context) {
      return fail(404, {
        error: 'Managed project stage not found.'
      });
    }

    const form = await request.formData();
    const stageName = text(form, 'stageName');
    const accountId = text(form, 'accountId');
    const primaryRegion = text(form, 'primaryRegion');
    const additionalRegions = regions(
      text(form, 'additionalRegions'),
      primaryRegion
    );
    const accessMode = text(form, 'accessMode') || 'default';
    const roleArn = text(form, 'roleArn');
    const externalId = text(form, 'externalId');
    const sourceIdentity = text(form, 'sourceIdentity');
    const diagnosticsProfile = text(form, 'diagnosticsProfile');
    const logGroups = text(form, 'logGroups')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const enabled = checkbox(form, 'enabled');

    if (
      !stageName ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(stageName)
    ) {
      return fail(400, {
        error:
          'Stage name must start with a letter or number and contain only letters, numbers, hyphens or underscores.'
      });
    }

    if (!/^\d{12}$/.test(accountId)) {
      return fail(400, {
        error: 'AWS account ID must be 12 digits.'
      });
    }

    if (!primaryRegion) {
      return fail(400, {
        error: 'Primary AWS region is required.'
      });
    }

    if (
      context.project.stages.some(
        (candidate) =>
          candidate.id !== context.stage.id &&
          candidate.name === stageName
      )
    ) {
      return fail(409, {
        error: 'Another stage in this project already uses that name.'
      });
    }

    const attachedResources = listResourcesForStage(
      context.stage.id
    );

    if (
      attachedResources.length &&
      accountId !== context.stage.accountId
    ) {
      return fail(409, {
        error:
          'AWS account identity cannot be changed while resources are attached to this stage.'
      });
    }

    if (
      accessMode === 'assume-role' &&
      !/^arn:[^:]+:iam::\d{12}:role\/.+/.test(roleArn)
    ) {
      return fail(400, {
        error: 'A valid IAM role ARN is required for assume-role access.'
      });
    }

    if (
      accessMode !== 'default' &&
      accessMode !== 'assume-role'
    ) {
      return fail(400, {
        error: 'Unsupported AWS access mode.'
      });
    }

    const updatedStage = {
      ...context.stage,
      name: stageName,
      accountId,
      primaryRegion,
      additionalRegions,
      access:
        accessMode === 'assume-role'
          ? {
              mode: 'assume-role' as const,
              roleArn,
              externalId: externalId || undefined,
              sourceIdentity:
                sourceIdentity || 'gatehouse'
            }
          : {
              mode: 'default' as const
            },
      capabilities: {
        logs: checkbox(form, 'capability_logs'),
        errors: checkbox(form, 'capability_errors'),
        requests: checkbox(form, 'capability_requests'),
        functions: checkbox(form, 'capability_functions'),
        services: checkbox(form, 'capability_services'),
        databases: checkbox(form, 'capability_databases'),
        queues: checkbox(form, 'capability_queues'),
        metrics: checkbox(form, 'capability_metrics'),
        costs: checkbox(form, 'capability_costs'),
        deployments: checkbox(form, 'capability_deployments'),
        traces: checkbox(form, 'capability_traces'),
        aiUsage: checkbox(form, 'capability_aiUsage'),
        auth: checkbox(form, 'capability_auth'),
        diagnostics: checkbox(
          form,
          'capability_diagnostics'
        )
      },
      selectors: logGroups.length
        ? [
            {
              kind: 'log-group' as const,
              names: logGroups
            }
          ]
        : [],
      enabled
    };

    if (updatedStage.enabled) {
      try {
        await assertAwsStageAccess(updatedStage);
      } catch (cause) {
        return fail(409, {
          error:
            'Stage settings were not saved because AWS access verification failed: ' +
            (cause instanceof Error
              ? cause.message
              : String(cause))
        });
      }
    }

    const updatedProject = saveManagedProject({
      ...context.project,
      diagnosticsProfile:
        diagnosticsProfile || undefined,
      updatedAt: new Date().toISOString(),
      stages: context.project.stages.map((stage) =>
        stage.id === context.stage.id
          ? updatedStage
          : stage
      )
    });

    const savedStage = updatedProject.stages.find(
      (stage) => stage.id === context.stage.id
    );

    if (!savedStage) {
      return fail(500, {
        error: 'Updated stage could not be reloaded.'
      });
    }

    if (savedStage.name !== params.stage) {
      throw redirect(
        303,
        `/p/${updatedProject.slug}/${savedStage.name}`
      );
    }

    return {
      success: true,
      action: 'updateStage'
    };
  }
};
