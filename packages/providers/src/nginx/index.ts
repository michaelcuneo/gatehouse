import type { Provider } from "../types";

import {
  destroyNginxResource,
  reconcileNginxResource,
} from "./reconcile";

export const nginxProvider: Provider = {
  name: "nginx",
  reconcile: reconcileNginxResource,
  destroy: destroyNginxResource,
};

export * from "./validate";
export * from "./render";
export * from "./runtime";
export * from "./reconcile";
