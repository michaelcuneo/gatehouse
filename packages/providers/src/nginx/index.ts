import type { Provider } from "../types";

import {
  destroyNginxResource,
  healthNginxResource,
  reconcileNginxResource,
} from "./reconcile";

export const nginxProvider: Provider = {
  name: "nginx",
  reconcile: reconcileNginxResource,
  destroy: destroyNginxResource,
  health: healthNginxResource,
};

export * from "./validate";
export * from "./render";
export * from "./runtime";
export * from "./reconcile";
