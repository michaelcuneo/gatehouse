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
import type { Resource, StaticSiteSpec } from '@gatehouse/types';
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
  },
  dynamodb: {
    kind: 'database_table',
    title: 'DynamoDB',
    description: 'AWS DynamoDB tables with safe primary-key and capacity management.'
  },
  functions: {
    kind: 'function',
    title: 'Functions',
    description: 'Imported AWS Lambda functions with GateHouse-managed runtime configuration and external code packages.'
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
    certificates: listResources('certificate'),
    staticSites: listResources<StaticSiteSpec>('static_site').map((site) => ({
      id: site.id,
      name: site.name,
      provider: site.provider,
      cloudFrontEnabled: site.spec.cloudFront?.enabled === true
    })),
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

    if (params.section === 'certificates') {
      stageId = text(form, 'stageId');
      const domains = text(form, 'domains')
        .split(',')
        .map((domain) => domain.trim())
        .filter(Boolean);
      const region = text(form, 'region') || 'us-east-1';
      const validation = text(form, 'validation') || 'dns';
      const certificateArn = text(form, 'certificateArn');

      if (!stageId || !getManagedStageById(stageId)) {
        return fail(400, {
          error: 'A valid project stage is required for ACM certificates.'
        });
      }

      if (!domains.length) {
        return fail(400, {
          error: 'At least one certificate domain is required.'
        });
      }

      if (validation !== 'dns' && validation !== 'email') {
        return fail(400, {
          error: 'Certificate validation must be DNS or email.'
        });
      }

      resource = {
        id: crypto.randomUUID(),
        kind: 'certificate',
        name,
        provider: 'acm',
        version: 1,
        enabled: true,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
        metadata: {
          managed: !certificateArn
        },
        spec: {
          provider: 'aws_acm',
          domains,
          wildcard: form.get('wildcard') === 'on',
          autoRenew: true,
          region,
          certificateArn: certificateArn || undefined,
          validation
        }
      };
    } else if (params.section === 'dns') {
      const zone = text(form, 'zone');
      const recordName = text(form, 'recordName');
      const dnsMode = text(form, 'dnsMode') || 'value';
      stageId = text(form, 'stageId');

      if (!stageId || !getManagedStageById(stageId)) {
        return fail(400, {
          error: 'A valid project stage is required for Route53 resources.'
        });
      }

      if (!zone || !recordName) {
        return fail(400, {
          error: 'Hosted zone and record name are required.'
        });
      }

      if (dnsMode === 'cloudfront_alias') {
        const staticSiteId = text(form, 'staticSiteId');
        const staticSite = staticSiteId
          ? getResource(staticSiteId)
          : null;

        if (!staticSite || staticSite.kind !== 'static_site') {
          return fail(400, {
            error: 'A valid static site is required for a CloudFront alias.'
          });
        }

        if (!staticSite.spec.cloudFront?.enabled) {
          return fail(400, {
            error: 'The selected static site does not have CloudFront enabled.'
          });
        }

        const staticSiteStageIds =
          listStageIdsForResource(staticSiteId);

        if (
          staticSiteStageIds.length !== 1 ||
          staticSiteStageIds[0] !== stageId
        ) {
          return fail(400, {
            error: 'The CloudFront alias and static site must belong to the same project stage.'
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
            mode: 'cloudfront_alias',
            zone,
            name: recordName,
            staticSiteId
          }
        };
      } else {
        const recordType = dnsRecordType(text(form, 'recordType'));
        const value = text(form, 'value');
        const ttl = Number(text(form, 'ttl') || 300);

        if (!recordType || !value) {
          return fail(400, {
            error: 'Record type and value are required.'
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
            mode: 'value',
            zone,
            name: recordName,
            type: recordType,
            value,
            ttl
          }
        };
      }
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
    } else if (params.section === 'dynamodb') {
      stageId = text(form, 'stageId');
      const selectedStage = stageId ? getManagedStageById(stageId) : null;
      const tableName = text(form, 'tableName');
      const region =
        text(form, 'region') ||
        selectedStage?.stage.primaryRegion ||
        '';
      const partitionKeyName = text(form, 'partitionKeyName');
      const partitionKeyType = text(form, 'partitionKeyType') || 'S';
      const sortKeyName = text(form, 'sortKeyName');
      const sortKeyType = text(form, 'sortKeyType') || 'S';
      const billingMode =
        text(form, 'billingMode') || 'PAY_PER_REQUEST';
      const readCapacity = Number(text(form, 'readCapacity') || 1);
      const writeCapacity = Number(text(form, 'writeCapacity') || 1);

      if (!stageId || !selectedStage) {
        return fail(400, {
          error: 'A valid project stage is required for DynamoDB.'
        });
      }

      if (!tableName || !partitionKeyName || !region) {
        return fail(400, {
          error: 'Table name, partition key and region are required.'
        });
      }

      if (
        !['S', 'N', 'B'].includes(partitionKeyType) ||
        !['S', 'N', 'B'].includes(sortKeyType)
      ) {
        return fail(400, {
          error: 'DynamoDB key types must be String, Number or Binary.'
        });
      }

      if (
        billingMode !== 'PAY_PER_REQUEST' &&
        billingMode !== 'PROVISIONED'
      ) {
        return fail(400, {
          error: 'Unsupported DynamoDB billing mode.'
        });
      }

      if (
        billingMode === 'PROVISIONED' &&
        (
          !Number.isInteger(readCapacity) ||
          !Number.isInteger(writeCapacity) ||
          readCapacity < 1 ||
          writeCapacity < 1
        )
      ) {
        return fail(400, {
          error: 'Provisioned capacity must use positive integers.'
        });
      }

      resource = {
        id: crypto.randomUUID(),
        kind: 'database_table',
        name,
        provider: 'dynamodb',
        version: 1,
        enabled: true,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
        metadata: {
          managed: true,
          ownership: {
            mode: 'gatehouse'
          }
        },
        spec: {
          provider: 'dynamodb',
          tableName,
          region,
          partitionKey: {
            name: partitionKeyName,
            type: partitionKeyType as 'S' | 'N' | 'B'
          },
          sortKey: sortKeyName
            ? {
                name: sortKeyName,
                type: sortKeyType as 'S' | 'N' | 'B'
              }
            : undefined,
          billingMode: billingMode as
            | 'PAY_PER_REQUEST'
            | 'PROVISIONED',
          readCapacity:
            billingMode === 'PROVISIONED'
              ? readCapacity
              : undefined,
          writeCapacity:
            billingMode === 'PROVISIONED'
              ? writeCapacity
              : undefined,
          deletionProtection:
            form.get('deletionProtection') === 'on'
        }
      };
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
        const cloudFrontEnabled = form.get('cloudFrontEnabled') === 'on';
        const distributionId = text(form, 'distributionId');
        const defaultRootObject =
          text(form, 'defaultRootObject') || 'index.html';
        const aliases = text(form, 'aliases')
          .split(',')
          .map((alias) => alias.trim().toLowerCase())
          .filter(Boolean);
        const certificateId = text(form, 'certificateId');

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

        if (cloudFrontEnabled) {
          if (aliases.length && !certificateId) {
            return fail(400, {
              error: 'Custom CloudFront hostnames require an ACM certificate.'
            });
          }

          if (certificateId && !aliases.length) {
            return fail(400, {
              error: 'An ACM certificate requires at least one custom CloudFront hostname.'
            });
          }

          if (distributionId && (aliases.length || certificateId)) {
            return fail(400, {
              error: 'GateHouse does not modify aliases or certificates on adopted CloudFront distributions.'
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
                error: 'The selected certificate must be an AWS ACM certificate.'
              });
            }

            const certificateStageIds =
              listStageIdsForResource(certificateId);

            if (
              certificateStageIds.length !== 1 ||
              certificateStageIds[0] !== stageId
            ) {
              return fail(400, {
                error: 'The selected ACM certificate must belong to the same project stage as the S3 storage resource.'
              });
            }

            if ((certificate.spec.region ?? 'us-east-1') !== 'us-east-1') {
              return fail(400, {
                error: 'CloudFront ACM certificates must be in us-east-1.'
              });
            }
          }
        }

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
            cloudFront: cloudFrontEnabled
              ? {
                  enabled: true,
                  distributionId: distributionId || undefined,
                  defaultRootObject,
                  aliases: aliases.length ? aliases : undefined,
                  certificateId: certificateId || undefined
                }
              : undefined,
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
