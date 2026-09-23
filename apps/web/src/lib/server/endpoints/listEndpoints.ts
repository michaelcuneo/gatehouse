import { listResources } from '@gatehouse/db';

export async function listEndpoints() {
  return listResources<EndpointSpec>('endpoint');
}
