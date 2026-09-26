import type { Provider } from "../types";

import {
  destroyRoute53Resource,
  healthRoute53Resource,
  reconcileRoute53Resource,
} from "./reconcile";

export const route53Provider: Provider = {
  name: "route53",
  reconcile: reconcileRoute53Resource,
  destroy: destroyRoute53Resource,
  health: healthRoute53Resource,
};

export * from "./validate";
export * from "./runtime";
export * from "./reconcile";
