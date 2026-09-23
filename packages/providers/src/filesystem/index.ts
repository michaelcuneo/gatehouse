import type { Provider } from "../types";

import {
  destroyFilesystemResource,
  reconcileFilesystemResource,
} from "./reconcile";

export const filesystemProvider: Provider = {
  name: "filesystem",
  reconcile: reconcileFilesystemResource,
  destroy: destroyFilesystemResource,
};

export * from "./validate";
export * from "./runtime";
export * from "./reconcile";
