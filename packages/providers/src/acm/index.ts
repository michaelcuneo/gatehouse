import type { Provider } from "../types";

import {
  destroyAcmResource,
  healthAcmResource,
  reconcileAcmResource,
} from "./reconcile";

export const acmProvider: Provider = {
  name: "acm",
  reconcile: reconcileAcmResource,
  destroy: destroyAcmResource,
  health: healthAcmResource,
};

export * from "./validate";
export * from "./reconcile";
