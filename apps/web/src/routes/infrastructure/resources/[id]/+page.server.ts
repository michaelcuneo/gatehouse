import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import {
  attachResourceToStage,
  detachResourceFromStage,
  getManagedStageById,
  listManagedProjects,
  listResources as listStoredResources,
  listStageIdsForResource,
  updateResourceState
} from '@gatehouse/db';
import {
  checkResourceHealth,
  reconcileResource
} from '@gatehouse/reconciliation';
import {
  getResource,
  updateResource
} from '@gatehouse/resources';
import type {
  DNSRecordType,
  Resource,
  ServiceRuntime
} from '@gatehouse/types';

function text(form: FormData, key: string) {
  return String(form.get(key) ?? '').trim();
}

function checkbox(form: FormData, key: string) {
  return form.get(key) === 'on';
}

function tags(form: FormData) {
  return text(form, 'tags')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function integer(
  form: FormData,
  key: string,
  options: { min: number; max: number }
) {
  const value = Number(text(form, key));

  if (
    !Number.isInteger(value) ||
    value < options.min ||
    value > options.max
  ) {
    return null;
  }

  return value;
}

function serviceRuntime(value: string): ServiceRuntime | null {
  switch (value) {
    case 'node':
    case 'bun':
    case 'docker':
    case 'python':
    case 'binary':
      return value;
    default:
      return null;
  }
}

function dnsType(value: string): DNSRecordType | null {
  switch (value) {
    case 'A':
    case 'AAAA':
    case 'CNAME':
    case 'TXT':
      return value;
    default:
      return null;
  }
}

function allStages() {
  return listManagedProjects().flatMap((project) =>
    project.stages.map((stage) => ({
      id: stage.id,
      label: `${project.name} / ${stage.name}`,
      accountId: stage.accountId,
      region: stage.primaryRegion,
      enabled: stage.enabled
    }))
  );
}

function stageChangeNeeded(
  resourceId: string,
  requestedStageId: string
) {
  if (requestedStageId && !getManagedStageById(requestedStageId)) {
    throw new Error('Selected project stage does not exist.');
  }

  const existing = listStageIdsForResource(resourceId);

  return !(
    existing.length === (requestedStageId ? 1 : 0) &&
    existing[0] === requestedStageId
  );
}

function applyOptionalStage(
  resourceId: string,
  requestedStageId: string
) {
  const existing = listStageIdsForResource(resourceId);

  for (const stageId of existing) {
    detachResourceFromStage(stageId, resourceId);
  }

  if (requestedStageId) {
    attachResourceToStage(requestedStageId, resourceId);
  }
}

function commonUpdate(
  resource: Resource,
  form: FormData
): Resource {
  const name = text(form, 'name');

  if (!name) {
    throw new Error('Resource name is required.');
  }

  const description = text(form, 'description');
  const resourceTags = tags(form);

  return {
    ...resource,
    name,
    metadata: {
      ...(resource.metadata ?? {}),
      description: description || undefined,
      tags: resourceTags.length ? resourceTags : undefined
    }
  };
}

export const load: PageServerLoad = async ({ params }) => {
  const resource = getResource(params.id);

  if (!resource) {
    throw error(404, 'GateHouse resource not found.');
  }

  return {
    resource,
    stageIds: listStageIdsForResource(resource.id),
    stages: allStages(),
    endpoints: listStoredResources('endpoint'),
    storage: listStoredResources('storage_bucket'),
    certificates: listStoredResources('certificate'),
    staticSites: listStoredResources('static_site')
  };
};

export const actions: Actions = {
  update: async ({ params, request }) => {
    const resource = getResource(params.id);

    if (!resource) {
      return fail(404, { error: 'GateHouse resource not found.' });
    }

    const form = await request.formData();

    try {
      let updated = commonUpdate(resource, form);
      let requestedStageId: string | null = null;
      let relatedDesiredStateChanged = false;

      switch (resource.kind) {
        case 'endpoint': {
          const mode = text(form, 'mode');
          const host = text(form, 'host');
          requestedStageId = text(form, 'stageId');

          if (!host) {
            return fail(400, { error: 'Endpoint hostname is required.' });
          }

          if (mode === 'reverse_proxy') {
            const upstreamHost =
              text(form, 'upstreamHost') || '127.0.0.1';
            const upstreamPort = integer(form, 'upstreamPort', {
              min: 1,
              max: 65535
            });

            if (upstreamPort === null) {
              return fail(400, {
                error: 'A valid upstream port is required.'
              });
            }

            updated = {
              ...updated,
              spec: {
                mode: 'reverse_proxy',
                host,
                upstream: {
                  host: upstreamHost,
                  port: upstreamPort
                },
                websocket: checkbox(form, 'websocket'),
                ssl: resource.spec.ssl,
                redirectToHttps: checkbox(form, 'redirectToHttps')
              }
            } as Resource;
          } else if (mode === 'static') {
            const root = text(form, 'root');

            if (!root) {
              return fail(400, {
                error: 'Static endpoint root is required.'
              });
            }

            updated = {
              ...updated,
              spec: {
                mode: 'static',
                host,
                root,
                spaFallback: checkbox(form, 'spaFallback'),
                ssl: resource.spec.ssl,
                redirectToHttps: checkbox(form, 'redirectToHttps')
              }
            } as Resource;
          } else {
            return fail(400, { error: 'Unsupported endpoint mode.' });
          }

          relatedDesiredStateChanged = stageChangeNeeded(
            resource.id,
            requestedStageId
          );
          break;
        }

        case 'service': {
          const runtime = serviceRuntime(text(form, 'runtime'));
          const workingDirectory = text(form, 'workingDirectory');
          const startCommand = text(form, 'startCommand');
          const envFile = text(form, 'envFile');
          const portName = text(form, 'portName') || 'http';
          const port = integer(form, 'port', {
            min: 1,
            max: 65535
          });
          const protocol = text(form, 'protocol');
          const healthPath = text(form, 'healthPath');
          const healthInterval = integer(form, 'healthInterval', {
            min: 10,
            max: 86400
          });

          if (!runtime || !workingDirectory || !startCommand) {
            return fail(400, {
              error: 'Runtime, working directory and start command are required.'
            });
          }

          if (
            port === null ||
            !['http', 'https', 'tcp'].includes(protocol)
          ) {
            return fail(400, {
              error: 'A valid service port and protocol are required.'
            });
          }

          if (healthPath && healthInterval === null) {
            return fail(400, {
              error: 'Health interval must be at least 10 seconds.'
            });
          }

          updated = {
            ...updated,
            spec: {
              runtime,
              workingDirectory,
              startCommand,
              envFile: envFile || undefined,
              ports: [
                {
                  name: portName,
                  port,
                  protocol: protocol as 'http' | 'https' | 'tcp'
                }
              ],
              autoStart: checkbox(form, 'autoStart'),
              healthcheck: healthPath
                ? {
                    path: healthPath,
                    intervalSeconds: healthInterval ?? 60
                  }
                : undefined
            }
          } as Resource;
          break;
        }

        case 'certificate': {
          if (resource.spec.provider !== 'aws_acm') {
            return fail(400, {
              error: 'Editing this certificate provider is not supported yet.'
            });
          }

          updated = {
            ...updated,
            spec: {
              ...resource.spec,
              autoRenew: checkbox(form, 'autoRenew')
            }
          } as Resource;
          break;
        }

        case 'dns_record': {
          if (resource.spec.mode === 'cloudfront_alias') {
            const staticSiteId = text(form, 'staticSiteId');
            const site = staticSiteId
              ? getResource(staticSiteId)
              : null;

            if (
              !site ||
              site.kind !== 'static_site' ||
              site.spec.cloudFront?.enabled !== true
            ) {
              return fail(400, {
                error: 'A CloudFront-enabled static site is required.'
              });
            }

            const recordStages = listStageIdsForResource(resource.id);
            const siteStages = listStageIdsForResource(staticSiteId);

            if (
              recordStages.length !== 1 ||
              siteStages.length !== 1 ||
              recordStages[0] !== siteStages[0]
            ) {
              return fail(400, {
                error: 'DNS alias and static site must belong to the same stage.'
              });
            }

            updated = {
              ...updated,
              spec: {
                ...resource.spec,
                staticSiteId
              }
            } as Resource;
          } else {
            const value = text(form, 'value');
            const ttl = integer(form, 'ttl', {
              min: 1,
              max: 2147483647
            });

            if (!value || ttl === null) {
              return fail(400, {
                error: 'DNS value and a valid TTL are required.'
              });
            }

            const type =
              dnsType(resource.spec.type) ?? resource.spec.type;

            updated = {
              ...updated,
              spec: {
                ...resource.spec,
                type,
                value,
                ttl
              }
            } as Resource;
          }
          break;
        }

        case 'storage_bucket': {
          if (resource.spec.provider === 's3') {
            updated = {
              ...updated,
              spec: {
                ...resource.spec,
                public: checkbox(form, 'public')
              }
            } as Resource;
          }
          break;
        }

        case 'static_site': {
          const buildDirectory = text(form, 'buildDirectory');

          if (!buildDirectory) {
            return fail(400, {
              error: 'Build directory is required.'
            });
          }

          if (resource.provider === 'filesystem') {
            const endpointId = text(form, 'endpointId');

            if (
              endpointId &&
              getResource(endpointId)?.kind !== 'endpoint'
            ) {
              return fail(400, {
                error: 'Selected endpoint dependency does not exist.'
              });
            }

            updated = {
              ...updated,
              spec: {
                ...resource.spec,
                buildDirectory,
                endpointId: endpointId || undefined,
                deployOnChange: checkbox(form, 'deployOnChange')
              }
            } as Resource;
          } else if (resource.provider === 's3') {
            const defaultRootObject =
              text(form, 'defaultRootObject') || 'index.html';
            const aliases = text(form, 'aliases')
              .split(',')
              .map((value) => value.trim().toLowerCase())
              .filter(Boolean);
            const certificateId = text(form, 'certificateId');

            if (
              aliases.length &&
              !certificateId &&
              resource.spec.cloudFront?.enabled
            ) {
              return fail(400, {
                error: 'Custom CloudFront aliases require an ACM certificate.'
              });
            }

            if (certificateId) {
              const certificate = getResource(certificateId);

              if (
                !certificate ||
                certificate.kind !== 'certificate' ||
                certificate.spec.provider !== 'aws_acm'
              ) {
                return fail(400, {
                  error: 'Selected certificate must be an AWS ACM certificate.'
                });
              }

              const siteStages = listStageIdsForResource(resource.id);
              const certificateStages =
                listStageIdsForResource(certificateId);

              if (
                siteStages.length !== 1 ||
                certificateStages.length !== 1 ||
                siteStages[0] !== certificateStages[0]
              ) {
                return fail(400, {
                  error: 'CloudFront certificate must belong to the same stage.'
                });
              }
            }

            updated = {
              ...updated,
              spec: {
                ...resource.spec,
                buildDirectory,
                deployOnChange: checkbox(form, 'deployOnChange'),
                cloudFront: resource.spec.cloudFront?.enabled
                  ? {
                      ...resource.spec.cloudFront,
                      defaultRootObject,
                      aliases: aliases.length ? aliases : undefined,
                      certificateId: certificateId || undefined
                    }
                  : resource.spec.cloudFront
              }
            } as Resource;
          }
          break;
        }
      }

      const saved = updateResource(updated, {
        forceDesiredStateChange: relatedDesiredStateChanged
      });

      if (requestedStageId !== null && relatedDesiredStateChanged) {
        applyOptionalStage(resource.id, requestedStageId);
      }

      return {
        success: true,
        action: 'update',
        version: saved.version
      };
    } catch (cause) {
      return fail(400, {
        error: cause instanceof Error ? cause.message : String(cause)
      });
    }
  },

  reconcile: async ({ params }) => {
    try {
      await reconcileResource(params.id);
      return { success: true, action: 'reconcile' };
    } catch (cause) {
      return fail(500, {
        error: cause instanceof Error ? cause.message : String(cause)
      });
    }
  },

  health: async ({ params }) => {
    try {
      await checkResourceHealth(params.id);
      return { success: true, action: 'health' };
    } catch (cause) {
      return fail(500, {
        error: cause instanceof Error ? cause.message : String(cause)
      });
    }
  },

  toggle: async ({ params }) => {
    const resource = getResource(params.id);

    if (!resource) {
      return fail(404, { error: 'GateHouse resource not found.' });
    }

    updateResourceState(params.id, {
      enabled: !resource.enabled,
      status: 'pending',
      runtime: {
        lastStatusMessage: resource.enabled
          ? 'Resource disabled; runtime removal pending'
          : 'Resource enabled; reconciliation pending'
      }
    });

    try {
      await reconcileResource(params.id);
      return {
        success: true,
        action: resource.enabled ? 'disable' : 'enable'
      };
    } catch (cause) {
      return fail(500, {
        error: cause instanceof Error ? cause.message : String(cause)
      });
    }
  }
};
