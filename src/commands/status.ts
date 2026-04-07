import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { DAEMON_PORT, ui } from '../shared';

const PID_FILE = join(homedir(), '.vesuvio', 'daemon.pid');

async function checkService(url: string): Promise<boolean> {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
        return res.ok;
    } catch {
        return false;
    }
}

async function checkTcp(host: string, port: number): Promise<boolean> {
    try {
        const net = await import('net');
        return new Promise<boolean>((resolve) => {
            const sock = net.createConnection(port, host);
            sock.setTimeout(2000);
            sock.on('connect', () => {
                sock.destroy();
                resolve(true);
            });
            sock.on('error', () => resolve(false));
            sock.on('timeout', () => {
                sock.destroy();
                resolve(false);
            });
        });
    } catch {
        return false;
    }
}

export default async function status(_args: string[]) {
    console.log(`\n  ${ui.brand('vesuvio status')}\n`);

    let daemonRunning = false;
    let daemonPid = 0;

    if (existsSync(PID_FILE)) {
        daemonPid = parseInt(readFileSync(PID_FILE, 'utf-8').trim());
        try {
            process.kill(daemonPid, 0);
            daemonRunning = true;
        } catch {}
    }

    if (!daemonRunning) {
        try {
            const res = await fetch(`http://localhost:${DAEMON_PORT}/health`, {
                signal: AbortSignal.timeout(2000),
            });
            daemonRunning = res.ok;
        } catch {}
    }

    const icon = (ok: boolean) => (ok ? ui.ok : ui.fail);

    console.log(
        `  ${icon(daemonRunning)} daemon       ${daemonRunning ? ui.success(`running${daemonPid ? ` (pid ${daemonPid})` : ''}`) : ui.error('stopped')}`
    );

    const services = [
        { label: 'ollama      ', url: 'http://localhost:11434/api/tags' },
        { label: 'lux         ', tcp: { host: 'localhost', port: 6379 } },
        { label: 'kokoro (tts)', url: 'http://localhost:8880/v1/audio/voices' },
        { label: 'whisper(stt)', url: 'http://localhost:8001/v1/models' },
    ];

    for (const svc of services) {
        const ok = svc.tcp
            ? await checkTcp(svc.tcp.host, svc.tcp.port)
            : await checkService(svc.url!);
        console.log(
            `  ${icon(ok)} ${svc.label} ${ok ? ui.success('connected') : ui.error('unavailable')}`
        );
    }

    console.log();
}
