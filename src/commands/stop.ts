import { existsSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { ui } from '../shared';

const PID_FILE = join(homedir(), '.vesuvio', 'daemon.pid');

export default async function stop(_args: string[]) {
    if (!existsSync(PID_FILE)) {
        console.log(ui.dim('no daemon running'));
        return;
    }

    const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim());

    try {
        process.kill(pid, 0);
        process.kill(pid, 'SIGTERM');
        console.log(ui.success(`daemon stopped (pid ${pid})`));
    } catch {
        console.log(ui.dim('daemon not running (stale pid)'));
    }

    try {
        unlinkSync(PID_FILE);
    } catch {}
}
