import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { spawn } from 'child_process';
import { ui } from '../shared';

const LOG_FILE = join(homedir(), '.vesuvio', 'daemon.log');

export default async function logs(_args: string[]) {
    if (!existsSync(LOG_FILE)) {
        console.log(ui.dim(`no log file found at ${LOG_FILE}`));
        return;
    }

    const lines = _args.find((a) => a.startsWith('-n'))?.slice(2) || '50';
    const tail = spawn('tail', ['-f', '-n', lines, LOG_FILE], { stdio: 'inherit' });

    process.on('SIGINT', () => {
        tail.kill();
        process.exit(0);
    });
    await new Promise((resolve) => tail.on('close', resolve));
}
