import { execFile } from 'node:child_process';

import { promisify } from 'node:util';

const exec = promisify(execFile);

export async function sudoExec(command: string, args: string[]) {
	return exec('sudo', [command, ...args]);
}
