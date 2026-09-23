import fs from "node:fs/promises";

import { GENERATED_NGINX_DIR } from "../paths";

export async function writeNginxConfig(
  filename: string,
  config: string,
): Promise<void> {
  await fs.writeFile(`${GENERATED_NGINX_DIR}/${filename}`, config, "utf8");
}
