import { reconcileNginxResource } from "./reconcile";

export const nginxProvider = {
  name: "nginx",

  reconcile: reconcileNginxResource,
};

export * from "./validate";
export * from "./render";
export * from "./runtime";
export * from "./reconcile";
