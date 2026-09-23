import type { Provider } from "../types";

import {
  destroySystemdResource,
  reconcileSystemdResource,
} from "./reconcile";

export const systemdProvider: Provider = {
  name: "systemd",
  reconcile: reconcileSystemdResource,
  destroy: destroySystemdResource,
};

export * from "./render";
export * from "./validate";
export * from "./runtime";
export * from "./reconcile";
