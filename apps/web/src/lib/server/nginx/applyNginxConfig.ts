import fs from 'node:fs/promises';

import { sudoExec } from '$lib/server/shell/sudoExec';

export async function applyNginxConfig(id: string, config: string) {
	const tempPath = `/tmp/${id}.conf`;

	await fs.writeFile(tempPath, config);

	await sudoExec('/usr/local/bin/route-manager-apply', [tempPath, `${id}.conf`]);
}
