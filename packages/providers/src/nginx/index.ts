import type { Provider } from "../types";

import { reconcileNginxResource } from "./reconcile";

export const nginxProvider: Provider = {
  name: "nginx",
  reconcile: reconcileNginxResource,
};

export * from "./validate";
export * from "./render";
export * from "./runtime";
export * from "./reconcile";
