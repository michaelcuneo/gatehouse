import type { BaseResource } from "../core/resource";

export type ServiceRuntime = "node" | "bun" | "docker" | "python" | "binary";

export interface ServicePort {
  name: string;

  port: number;

  protocol: "http" | "https" | "tcp";
}

export interface ServiceSpec {
  runtime: ServiceRuntime;

  workingDirectory: string;

  startCommand: string;

  envFile?: string;

  ports: ServicePort[];

  autoStart?: boolean;

  healthcheck?: {
    path: string;

    intervalSeconds: number;
  };
}

export type ServiceResource = BaseResource<"service", ServiceSpec>;
