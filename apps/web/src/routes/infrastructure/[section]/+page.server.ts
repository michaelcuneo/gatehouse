import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import {
  attachResourceToStage,
  getManagedStageById,
  listManagedProjects,
  listResources,
  listStageIdsForResource,
  type StoredResourceKind
} from '@gatehouse/db';
import { reconcileResource } from '@gatehouse/reconciliation';
import {
  createResource,
  getResource
} from '@gatehouse/resources';

const sections: Record<
  string,
  { kind: StoredResourceKind; title: string; description: string }
> = {
  services: {
    kind: 'service',
    title: 'Services',
    description: 'Node, Bun, Docker, Python and binary services managed by GateHouse.'
  },
  certificates: {
    kind: 'certificate',
    title: 'Certificates',
    description: 'TLS certificates, wildcard certificates and AWS ACM resources.'
  },
  dns: {
    kind: 'dns_record',
    title: 'DNS',
    description: 'DNS desired state, including Route53 records.'
  },
  storage: {
    kind: 'storage_bucket',
    title: 'Storage',
    description: 'Local storage and AWS S3 resources.'
  },
  'static-sites': {
    kind: 'static_site',
    title: 'Static Sites',
    description: 'Deployable static sites targeting local storage or AWS.'
  }
};

function text(form: FormData, key: string) {
  return String(form.get(key) ?? '').trim();
}

function serviceRuntime(value: string) {
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

function dnsRecordType(value: string) {
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

function serviceProtocol(value: string) {
  switch (value) {
    case 'http':
    case 'https':
    case 'tcp':
      return value;
    default:
      return null;
  }
}

export const load: PageServerLoad = async ({ params }) => {
  const section = sections[params.section];

  if (!section) {
    throw error(404, 'Infrastructure section not found.');
  }

  return {
    section,
    resources: listResources(section.kind),
    endpoints: listResources('endpoint'),
    storage: listResources('storage_bucket'),
    projectStages: listManagedProjects().flatMap((project) =>
      project.stages
        .filter((stage) => stage.enabled)
        .map((stage) => ({
          stageId: stage.id,
          label: `${project.name} / ${stage.name}`,
          accountId: stage.accountId,
          region: stage.primaryRegion
        }))
    )
  };
};

export const actions: Actions = {
  create: async ({ params, request }) => {
    const section = sections[params.section];

    if (!section) {
      return fail(404, { error: 'Infrastructure section not found.' });
    }

    const form = await request.formData();
    const name = text(form, 'name');

    if (!name) {
      return fail(400, { error: 'Resource name is required.' });
    }

    const now = new Date().toISOString();
    let resource: Resource;

    let stageId: string | undefined;

    if (params.section === 'dns') {
      const zone = text(form, 'zone');
      const recordName = text(form, 'recordName');
      const recordType = dnsRecordType(text(form, 'recordType'));
      const value = text(form, 'value');
      const ttl = Number(text(form, 'ttl') || 300);
      stageId = text(form, 'stageId');

      if (!stageId) {
        return fail(400, {
          error: 'A project stage is required for Route53 resources.'
        });
      }

      if (!zone || !recordName || !recordType || !value) {
        return fail(400, {
          error: 'Hosted zone, record name, type and value are required.'
        });
      }

      if (!Number.isInteger(ttl) || ttl < 1 || ttl > 2147483647) {
        return fail(400, {
          error: 'TTL must be a positive integer.'
        });
      }

      resource = {
        id: crypto.randomUUID(),
        kind: 'dns_record',
        name,
        provider: 'route53',
        version: 1,
        enabled: true,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
        metadata: {
          managed: true
        },
        spec: {
          zone,
          name: recordName,
          type: recordType,
          value,
          ttl
        }
      };
    } else if (params.section === 'services') {
      const runtime = serviceRuntime(text(form, 'runtime'));
      const workingDirectory = text(form, 'workingDirectory');
      const startCommand = text(form, 'startCommand');
      const envFile = text(form, 'envFile');
      const portName = text(form, 'portName') || 'http';
      const port = Number(text(form, 'port'));
      const protocol = serviceProtocol(text(form, 'protocol') || 'http');
      const healthPath = text(form, 'healthPath');
      const healthInterval = Number(text(form, 'healthInterval') || 60);

      if (!runtime) {
        return fail(400, { error: 'A valid service runtime is required.' });
      }

      if (!workingDirectory || !startCommand) {
        return fail(400, {
          error: 'Working directory and start command are required.'
        });
      }

      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return fail(400, { error: 'A valid service port is required.' });
      }

      if (!protocol) {
        return fail(400, { error: 'A valid port protocol is required.' });
      }

      if (
        healthPath &&
        (!Number.isFinite(healthInterval) || healthInterval < 10)
      ) {
        return fail(400, {
          error: 'Health interval must be at least 10 seconds.'
        });
      }

      resource = {
        id: crypto.randomUUID(),
        kind: 'service',
        name,
        provider: 'systemd',
        version: 1,
        enabled: true,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
        metadata: {
          managed: true
        },
        spec: {
          runtime,
          workingDirectory,
          startCommand,
          envFile: envFile || undefined,
          ports: [
            {
              name: portName,
              port,
              protocol
            }
          ],
          autoStart: form.get('autoStart') === 'on',
          healthcheck: healthPath
            ? {
                path: healthPath,
                intervalSeconds: healthInterval
              }
            : undefined
        }
      };
    } else if (params.section === 'storage') {
      const storageProvider = text(form, 'storageProvider') || 'local';

      if (storageProvider === 'local') {
        const storagePath = text(form, 'path');

        if (!storagePath) {
          return fail(400, { error: 'Storage path is required.' });
        }

        resource = {
          id: crypto.randomUUID(),
          kind: 'storage_bucket',
          name,
          provider: 'filesystem',
          version: 1,
          enabled: true,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
          metadata: {
            managed: true
          },
          spec: {
            provider: 'local',
            path: storagePath
          }
        };
      } else if (storageProvider === 's3') {
        stageId = text(form, 'stageId');
        const bucket = text(form, 'bucket');
        const selectedStage = stageId ? getManagedStageById(stageId) : null;
        const region =
          text(form, 'region') ||
          selectedStage?.stage.primaryRegion ||
          '';

        if (!stageId || !selectedStage) {
          return fail(400, {
            error: 'A valid project stage is required for S3 storage.'
          });
        }

        if (!bucket) {
          return fail(400, { error: 'S3 bucket name is required.' });
        }

        if (!region) {
          return fail(400, { error: 'S3 bucket region is required.' });
        }

        resource = {
          id: crypto.randomUUID(),
          kind: 'storage_bucket',
          name,
          provider: 's3',
          version: 1,
          enabled: true,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
          metadata: {
            managed: true
          },
          spec: {
            provider: 's3',
            bucket,
            region,
            public: form.get('public') === 'on'
          }
        };
      } else {
        return fail(400, { error: 'Unsupported storage provider.' });
      }
    } else if (params.section === 'static-sites') {
      const deploymentTarget = text(form, 'deploymentTarget') || 'local';
      const buildDirectory = text(form, 'buildDirectory');

      if (!buildDirectory) {
        return fail(400, {
          error: 'Build directory is required.'
        });
      }

      if (deploymentTarget === 'local') {
        const outputDirectory = text(form, 'outputDirectory');
        const endpointId = text(form, 'endpointId');
        const storageId = text(form, 'storageId');

        if (!outputDirectory) {
          return fail(400, {
            error: 'Output directory is required for local static deployments.'
          });
        }

        resource = {
          id: crypto.randomUUID(),
          kind: 'static_site',
          name,
          provider: 'filesystem',
          version: 1,
          enabled: true,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
          metadata: {
            managed: true
          },
          spec: {
            buildDirectory,
            outputDirectory,
            endpointId: endpointId || undefined,
            storageId: storageId || undefined,
            deployOnChange: form.get('deployOnChange') === 'on'
          }
        };
      } else if (deploymentTarget === 's3') {
        const storageId = text(form, 'storageId');
        const prefix = text(form, 'prefix');

        if (!storageId) {
          return fail(400, {
            error: 'An S3 storage resource is required.'
          });
        }

        const storageResource = getResource(storageId);

        if (
          !storageResource ||
          storageResource.kind !== 'storage_bucket' ||
          storageResource.spec.provider !== 's3'
        ) {
          return fail(400, {
            error: 'The selected storage resource must be an S3 bucket.'
          });
        }

        const stageIds = listStageIdsForResource(storageId);

        if (stageIds.length !== 1) {
          return fail(400, {
            error: 'The selected S3 storage resource must belong to exactly one project stage.'
          });
        }

        stageId = stageIds[0];

        resource = {
          id: crypto.randomUUID(),
          kind: 'static_site',
          name,
          provider: 's3',
          version: 1,
          enabled: true,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
          metadata: {
            managed: true
          },
          spec: {
            buildDirectory,
            storageId,
            prefix: prefix || undefined,
            deployOnChange: form.get('deployOnChange') === 'on'
          }
        };
      } else {
        return fail(400, {
          error: 'Unsupported static-site deployment target.'
        });
      }
    } else {
      return fail(400, {
        error: `Creation is not implemented for ${section.title} yet.`
      });
    }

    try {
      createResource(resource);

      if (stageId) {
        attachResourceToStage(stageId, resource.id);
      }

      await reconcileResource(resource.id);

      return { success: true };
    } catch (cause) {
      return fail(500, {
        error: cause instanceof Error ? cause.message : String(cause)
      });
    }
  }
};
