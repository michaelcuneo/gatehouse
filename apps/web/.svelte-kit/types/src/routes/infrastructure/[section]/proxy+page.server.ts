// @ts-nocheck
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

import { listResources, type StoredResourceKind } from '@gatehouse/db';

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

export const load = async ({ params }: Parameters<PageServerLoad>[0]) => {
  const section = sections[params.section];

  if (!section) {
    throw error(404, 'Infrastructure section not found.');
  }

  return {
    section,
    resources: listResources(section.kind)
  };
};
