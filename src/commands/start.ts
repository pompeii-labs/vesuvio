import { spawn } from 'child_process';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { ui } from '../shared';

const PID_FILE = join(homedir(), '.vesuvio', 'daemon.pid');
const LOG_FILE = join(homedir(), '.vesuvio', 'daemon.log');

function findDaemonEntry(): string | null {
    const candidates = [
        join(process.cwd(), 'src/daemon/index.ts'),
        join(homedir(), 'vesuvio/src/daemon/index.ts'),
    ];
    return candidates.find(existsSync) || null;
}

export default async function start(args: string[]) {
    const daemonize = args.includes('-d') || args.includes('--daemon');

    if (existsSync(PID_FILE)) {
        try {
            const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim());
            process.kill(pid, 0);
            console.log(ui.warn(`daemon already running (pid ${pid})`));
            return;
        } catch {}
    }

    const entry = findDaemonEntry();
    if (!entry) {
        console.error(ui.error('could not find daemon entry point'));
        process.exit(1);
    }

    const configDir = join(homedir(), '.vesuvio');
    if (!existsSync(configDir)) {
        const { mkdirSync } = await import('fs');
        mkdirSync(configDir, { recursive: true });
    }

    if (daemonize) {
        const { openSync } = await import('fs');
        const out = openSync(LOG_FILE, 'a');
        const child = spawn('bun', ['run', entry], {
            detached: true,
            stdio: ['ignore', out, out],
        });
        child.unref();
        writeFileSync(PID_FILE, String(child.pid));
        console.log(ui.success(`daemon started (pid ${child.pid})`));
        console.log(ui.dim(`logs: ${LOG_FILE}`));
    } else {
        const { execSync } = await import('child_process');
        try {
            execSync(`bun run ${entry}`, { stdio: 'inherit' });
        } catch {}
    }
}
