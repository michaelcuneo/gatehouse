import { updateResourceState } from "@gatehouse/db";
import type { Resource } from "@gatehouse/types";

export function updateResourceRuntime(
  id: string,
  runtime: Resource["runtime"],
): void {
  updateResourceState(id, { runtime });
}
