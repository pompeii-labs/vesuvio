import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import * as readline from 'readline';
import { VERSION, ui } from '../shared';

const CONFIG_DIR = join(homedir(), '.vesuvio');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

function ask(rl: readline.Interface, prompt: string, defaultVal?: string): Promise<string> {
    const suffix = defaultVal ? ` ${ui.dim(`(${defaultVal})`)}` : '';
    return new Promise((resolve) => {
        rl.question(`  ${ui.peach('>')} ${prompt}${suffix}: `, (answer) => {
            resolve(answer.trim() || defaultVal || '');
        });
    });
}

async function checkHttp(url: string): Promise<boolean> {
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

export default async function setup(_args: string[]) {
    console.log(`\n  ${ui.brand('vesuvio setup')} ${ui.dim(`v${VERSION}`)}\n`);

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    let config: Record<string, any> = {};
    if (existsSync(CONFIG_FILE)) {
        try {
            config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
        } catch {}
        console.log(`  ${ui.dim(`existing config found at ${CONFIG_FILE}`)}\n`);
    }

    // 1. Ollama
    console.log(`  ${ui.text('1. Ollama (LLM)')}`);
    const ollamaHost = await ask(rl, 'ollama host', config.ollama?.host || 'localhost');
    const ollamaPort = await ask(rl, 'ollama port', String(config.ollama?.port || 11434));
    const ollamaUrl = `http://${ollamaHost}:${ollamaPort}`;
    const ollamaOk = await checkHttp(`${ollamaUrl}/api/tags`);
    console.log(
        `  ${ollamaOk ? ui.ok : ui.fail} ${ollamaOk ? ui.success('connected') : ui.error('not reachable')}\n`
    );

    let model = config.ollama?.model || 'gemma4:26b';
    if (ollamaOk) {
        try {
            const res = await fetch(`${ollamaUrl}/api/tags`);
            const data = (await res.json()) as { models: Array<{ name: string }> };
            const models = data.models?.map((m) => m.name) || [];
            if (models.length > 0) {
                console.log(`  ${ui.dim(`available: ${models.join(', ')}`)}`);
                model = await ask(rl, 'model', model);
            }
        } catch {}
    }

    // 2. Lux
    console.log(`\n  ${ui.text('2. Lux (database)')}`);
    const luxHost = await ask(rl, 'lux host', config.lux?.host || 'localhost');
    const luxPort = await ask(rl, 'lux port', String(config.lux?.port || 6379));
    const luxOk = await checkTcp(luxHost, Number(luxPort));
    console.log(
        `  ${luxOk ? ui.ok : ui.fail} ${luxOk ? ui.success('connected') : ui.error('not reachable')}\n`
    );

    // 3. Kokoro TTS
    console.log(`  ${ui.text('3. Kokoro TTS (optional)')}`);
    const ttsHost = await ask(rl, 'kokoro host', config.tts?.host || 'localhost');
    const ttsPort = await ask(rl, 'kokoro port', String(config.tts?.port || 8880));
    const ttsOk = await checkHttp(`http://${ttsHost}:${ttsPort}/v1/audio/voices`);
    console.log(
        `  ${ttsOk ? ui.ok : ui.pending} ${ttsOk ? ui.success('connected') : ui.warn('not found (voice disabled)')}\n`
    );

    // 4. Whisper STT
    console.log(`  ${ui.text('4. Whisper STT (optional)')}`);
    const sttHost = await ask(rl, 'whisper host', config.stt?.host || 'localhost');
    const sttPort = await ask(rl, 'whisper port', String(config.stt?.port || 8001));
    const sttOk = await checkHttp(`http://${sttHost}:${sttPort}/v1/models`);
    console.log(
        `  ${sttOk ? ui.ok : ui.pending} ${sttOk ? ui.success('connected') : ui.warn('not found (voice disabled)')}\n`
    );

    // 5. API Keys
    console.log(`  ${ui.text('5. API Keys (optional)')}`);
    console.log(`  ${ui.dim('skip with enter')}\n`);

    const openrouterKey = await ask(rl, 'OpenRouter API key', config.openrouter?.apiKey || '');
    let openrouterModel = '';
    if (openrouterKey) {
        openrouterModel = await ask(
            rl,
            'OpenRouter model',
            config.openrouter?.model || 'anthropic/claude-sonnet-4'
        );
    }
    const tavilyKey = await ask(rl, 'Tavily API key (web search)', config.tavily?.apiKey || '');

    // 6. Daemon
    const daemonPort = await ask(rl, 'daemon port', String(config.daemon?.port || 7700));

    // 7. Provider
    let provider = 'ollama';
    if (openrouterKey && ollamaOk) {
        provider = await ask(
            rl,
            'default provider (ollama / openrouter)',
            config.provider || 'ollama'
        );
    } else if (openrouterKey && !ollamaOk) {
        provider = 'openrouter';
    }

    rl.close();

    // Write
    const newConfig: Record<string, any> = {
        daemon: { port: Number(daemonPort) },
        provider,
        ollama: { host: ollamaHost, port: Number(ollamaPort), model },
        lux: { host: luxHost, port: Number(luxPort) },
        tts: { host: ttsHost, port: Number(ttsPort) },
        stt: { host: sttHost, port: Number(sttPort) },
    };
    if (openrouterKey) newConfig.openrouter = { apiKey: openrouterKey, model: openrouterModel };
    if (tavilyKey) newConfig.tavily = { apiKey: tavilyKey };

    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 2));

    console.log(`\n  ${ui.success(`config saved to ${CONFIG_FILE}`)}`);
    console.log(`\n  ${ui.text('summary:')}`);
    console.log(
        `  ${ollamaOk ? ui.ok : ui.fail} ollama       ${ollamaHost}:${ollamaPort} (${model})`
    );
    console.log(`  ${luxOk ? ui.ok : ui.fail} lux          ${luxHost}:${luxPort}`);
    console.log(`  ${ttsOk ? ui.ok : ui.pending} kokoro       ${ttsHost}:${ttsPort}`);
    console.log(`  ${sttOk ? ui.ok : ui.pending} whisper      ${sttHost}:${sttPort}`);
    console.log(
        `  ${openrouterKey ? ui.ok : ui.dim('○')} openrouter   ${openrouterKey ? openrouterModel : 'not configured'}`
    );
    console.log(
        `  ${tavilyKey ? ui.ok : ui.dim('○')} tavily       ${tavilyKey ? 'configured' : 'not configured'}`
    );
    console.log(`  ${ui.peach(`provider: ${provider}`)}`);
    console.log(`\n  ${ui.dim("run 'vesuvio start' to start the daemon")}\n`);
}
