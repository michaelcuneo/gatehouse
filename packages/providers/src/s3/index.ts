import type { Provider } from "../types";

import {
  destroyS3Resource,
  healthS3Resource,
  reconcileS3Resource,
} from "./reconcile";

export const s3Provider: Provider = {
  name: "s3",
  reconcile: reconcileS3Resource,
  destroy: destroyS3Resource,
  health: healthS3Resource,
};

export * from "./validate";
export * from "./staticSite";
export * from "./reconcile";
