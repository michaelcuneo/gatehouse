export type ProjectProvider = "aws";

export type ProjectAccess =
  | {
      mode: "default";
    }
  | {
      mode: "assume-role";
      roleArn: string;
      externalId?: string;
      sourceIdentity?: string;
    };

export interface ProjectCapabilities {
  logs: boolean;
  errors: boolean;
  requests: boolean;
  functions: boolean;
  services: boolean;
  databases: boolean;
  queues: boolean;
  metrics: boolean;
  costs: boolean;
  deployments: boolean;
  traces: boolean;
  aiUsage: boolean;
  auth: boolean;
  diagnostics: boolean;
}

export const defaultProjectCapabilities: ProjectCapabilities = {
  logs: true,
  errors: true,
  requests: false,
  functions: false,
  services: false,
  databases: false,
  queues: false,
  metrics: false,
  costs: false,
  deployments: false,
  traces: false,
  aiUsage: false,
  auth: false,
  diagnostics: false,
};

export type AwsResourceKind =
  | "lambda"
  | "log-group"
  | "dynamodb"
  | "sqs"
  | "ecs-service"
  | "api-gateway"
  | "appsync"
  | "cloudfront"
  | "ses";

export interface AwsResourceSelector {
  kind: AwsResourceKind;
  names?: string[];
  namePrefix?: string;
  tags?: Record<string, string>;
}

export interface ManagedStage {
  id: string;
  name: string;
  accountId: string;
  primaryRegion: string;
  additionalRegions?: string[];
  access: ProjectAccess;
  capabilities: ProjectCapabilities;
  selectors?: AwsResourceSelector[];
  manifest?: ProjectManifestLocation;
  enabled: boolean;
}

export interface ManagedProject {
  id: string;
  slug: string;
  name: string;
  provider: ProjectProvider;
  diagnosticsProfile?: string;
  stages: ManagedStage[];
  createdAt: string;
  updatedAt: string;
}

export type ProjectManifestLocation =
  | {
      type: "inline";
      value: GateHouseProjectManifest;
    }
  | {
      type: "ssm";
      parameterName: string;
    };

export interface GateHouseProjectManifest {
  schemaVersion: 1;
  project: string;
  stage: string;
  resources: Record<
    string,
    {
      type: AwsResourceKind;
      name?: string;
      arn?: string;
      region?: string;
    }
  >;
  components: ProjectComponent[];
  diagnostics?: {
    profile?: string;
    bindings?: Record<string, string>;
  };
}

export type ProjectComponentKind =
  | "api"
  | "worker"
  | "queue"
  | "database"
  | "auth"
  | "connector"
  | "ai"
  | "cron"
  | "service";

export interface ProjectComponent {
  id: string;
  label: string;
  kind: ProjectComponentKind;
  resources: string[];
}

export interface ProjectStageContext {
  project: ManagedProject;
  stage: ManagedStage;
}
