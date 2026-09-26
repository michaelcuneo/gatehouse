import type { ResourceId } from "../core/common";

import type { ResourceKind } from "../core/resource";

export interface GeneratedNginxConfig {
  filename: string;

  serverName: string;

  config: string;
}

export interface ResourceReference {
  kind: ResourceKind;

  id: ResourceId;
}

export interface ResourceDependencyGraph {
  resourceId: ResourceId;

  dependsOn: ResourceReference[];
}

export interface MachineState {
  nginxInstalled: boolean;

  nginxRunning: boolean;

  acmeInstalled: boolean;

  dockerInstalled: boolean;

  publicIp?: string;
}

export interface AuditLog {
  id: string;

  resourceId: ResourceId;

  action: "create" | "update" | "delete" | "reconcile";

  timestamp: string;

  success: boolean;

  message?: string;
}
