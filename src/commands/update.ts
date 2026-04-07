import { homedir, platform, arch } from 'os';
import { join } from 'path';
import { writeFileSync, chmodSync } from 'fs';
import { VERSION, ui } from '../shared';

const REPO = 'pompeii-labs/vesuvio';

async function getLatestVersion(): Promise<string> {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    const data = (await res.json()) as { tag_name: string };
    return data.tag_name?.replace(/^v/, '') || '';
}

function getBinaryName(): string {
    const os = platform() === 'darwin' ? 'darwin' : 'linux';
    const a = arch() === 'arm64' ? 'arm64' : 'x64';
    return `vesuvio-${os}-${a}`;
}

export default async function update(args: string[]) {
    const checkOnly = args.includes('--check');

    console.log(`\n  ${ui.brand('vesuvio update')}`);
    console.log(`  ${ui.dim(`current: v${VERSION}`)}\n`);

    let latest: string;
    try {
        latest = await getLatestVersion();
    } catch (e: any) {
        console.error(ui.error(`  could not check for updates: ${e.message}`));
        return;
    }

    if (!latest) {
        console.log(ui.dim('  no releases found'));
        return;
    }

    console.log(`  ${ui.dim(`latest:  v${latest}`)}`);

    if (latest === VERSION) {
        console.log(`\n  ${ui.success('already up to date')}\n`);
        return;
    }

    console.log(`\n  ${ui.warn(`update available: v${VERSION} → v${latest}`)}`);

    if (checkOnly) {
        console.log(ui.dim(`\n  run 'vesuvio update' to install\n`));
        return;
    }

    const binary = getBinaryName();
    const installDir = join(homedir(), '.local', 'bin');
    const installPath = join(installDir, 'vesuvio');
    const url = `https://github.com/${REPO}/releases/download/v${latest}/${binary}`;

    console.log(ui.dim(`  downloading ${binary}...`));

    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
        if (!res.ok) throw new Error(`download failed: ${res.status}`);

        const buf = Buffer.from(await res.arrayBuffer());
        writeFileSync(installPath, buf);
        chmodSync(installPath, 0o755);

        console.log(`\n  ${ui.success(`updated to v${latest}`)}`);
        console.log(ui.dim(`  installed to ${installPath}\n`));
    } catch (e: any) {
        console.error(ui.error(`  update failed: ${e.message}`));
    }
}
