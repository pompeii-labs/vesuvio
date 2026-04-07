import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import {
    DAEMON_PORT,
    LUX_PORT,
    OLLAMA_PORT,
    OLLAMA_MODEL,
    KOKORO_PORT,
    WHISPER_PORT,
} from '../shared';

const CONFIG_FILE = join(homedir(), '.vesuvio', 'config.json');

export interface DaemonConfig {
    port: number;
    lux: { host: string; port: number };
    ollama: { host: string; port: number; model: string };
    tts: { host: string; port: number };
    stt: { host: string; port: number };
    openrouter?: { apiKey: string; model: string };
    tavily?: { apiKey: string };
    provider: 'ollama' | 'openrouter';
    context_limit: number;
}

const defaults: DaemonConfig = {
    port: DAEMON_PORT,
    lux: { host: 'localhost', port: LUX_PORT },
    ollama: { host: 'localhost', port: OLLAMA_PORT, model: OLLAMA_MODEL },
    tts: { host: 'localhost', port: KOKORO_PORT },
    stt: { host: 'localhost', port: WHISPER_PORT },
    provider: 'ollama',
    context_limit: 32768,
};

export function loadConfig(): DaemonConfig {
    let fileConfig: Record<string, any> = {};

    // Load from ~/.vesuvio/config.json
    if (existsSync(CONFIG_FILE)) {
        try {
            fileConfig = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
        } catch {}
    }

    // Merge: file config overrides defaults, env vars override everything
    const config: DaemonConfig = {
        port: fileConfig.daemon?.port || defaults.port,
        lux: {
            host: fileConfig.lux?.host || defaults.lux.host,
            port: fileConfig.lux?.port || defaults.lux.port,
        },
        ollama: {
            host: fileConfig.ollama?.host || defaults.ollama.host,
            port: fileConfig.ollama?.port || defaults.ollama.port,
            model: fileConfig.ollama?.model || defaults.ollama.model,
        },
        tts: {
            host: fileConfig.tts?.host || defaults.tts.host,
            port: fileConfig.tts?.port || defaults.tts.port,
        },
        stt: {
            host: fileConfig.stt?.host || defaults.stt.host,
            port: fileConfig.stt?.port || defaults.stt.port,
        },
        provider: fileConfig.provider || defaults.provider,
        context_limit: fileConfig.context_limit || defaults.context_limit,
    };

    // OpenRouter config
    const orKey = process.env.OPENROUTER_API_KEY || fileConfig.openrouter?.apiKey;
    if (orKey) {
        config.openrouter = {
            apiKey: orKey,
            model: fileConfig.openrouter?.model || 'anthropic/claude-sonnet-4',
        };
    }

    // Tavily config
    const tavilyKey = process.env.TAVILY_API_KEY || fileConfig.tavily?.apiKey;
    if (tavilyKey) {
        config.tavily = { apiKey: tavilyKey };
    }

    return config;
}

export function getConfigPath(): string {
    return CONFIG_FILE;
}
