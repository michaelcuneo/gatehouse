import type { Provider } from "../types";

import {
  destroyFilesystemResource,
  healthFilesystemResource,
  reconcileFilesystemResource,
} from "./reconcile";

export const filesystemProvider: Provider = {
  name: "filesystem",
  reconcile: reconcileFilesystemResource,
  destroy: destroyFilesystemResource,
  health: healthFilesystemResource,
};

export * from "./validate";
export * from "./runtime";
export * from "./reconcile";
