import type { BaseResource } from "../core/resource";

export type EndpointMode = "reverse_proxy" | "static";

export interface ReverseProxyEndpointSpec {
  mode: "reverse_proxy";

  host: string;

  upstream: {
    host: string;
    port: number;
  };

  websocket?: boolean;

  ssl?: boolean;

  redirectToHttps?: boolean;
}

export interface StaticEndpointSpec {
  mode: "static";

  host: string;

  root: string;

  spaFallback?: boolean;

  ssl?: boolean;

  redirectToHttps?: boolean;
}

export type EndpointSpec = ReverseProxyEndpointSpec | StaticEndpointSpec;

export type EndpointResource = BaseResource<"endpoint", EndpointSpec>;
