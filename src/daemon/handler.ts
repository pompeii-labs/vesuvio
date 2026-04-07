import type { ServerWebSocket } from 'bun';
import type { JsonRpcRequest } from '../shared';
import { Methods, Keys, Notifications } from '../shared';
import { getLux } from '../services/lux';
import { VesuvioAgent } from '../agent/vesuvio';
import { loadConfig } from './config';
import { textToSpeech, speechToText, listVoices } from '../services/voice';
import type { DaemonServer } from './server';

type ClientData = { id: string };

let agent: VesuvioAgent | null = null;

function getAgent(): VesuvioAgent {
    if (!agent) {
        agent = new VesuvioAgent(loadConfig());
    }
    return agent;
}

export function createHandler(server: DaemonServer) {
    return async (ws: ServerWebSocket<ClientData>, req: JsonRpcRequest): Promise<unknown> => {
        return handleRequest(server, ws, req);
    };
}

async function handleRequest(
    server: DaemonServer,
    ws: ServerWebSocket<ClientData>,
    req: JsonRpcRequest
): Promise<unknown> {
    const lux = getLux();
    const params = (req.params || {}) as Record<string, any>;

    switch (req.method) {
        case Methods.STATE: {
            const state = await lux.hgetall(Keys.STATE_DAEMON);
            return { ...state, connected_clients: server.clientCount };
        }

        case Methods.SESSION_CREATE: {
            const name = params.name || `session-${Date.now()}`;
            const id = await lux.table('sessions').insert({
                name,
                created_at: Date.now(),
                updated_at: Date.now(),
                summary: '',
                token_count: 0,
                status: 'active',
            });
            return { id, name };
        }

        case Methods.SESSION_LIST: {
            const sessions = await lux.table('sessions').run();
            return { sessions: sessions.sort((a, b) => (b.id as number) - (a.id as number)) };
        }

        case Methods.SESSION_GET: {
            const sessRaw = (await lux.call(
                'TQUERY',
                'sessions',
                'WHERE',
                'id',
                '=',
                String(params.id)
            )) as any[];
            const msgRaw = (await lux.call(
                'TQUERY',
                'messages',
                'WHERE',
                'session_id',
                '=',
                String(params.id)
            )) as any[];
            return {
                session: parseRawRows(sessRaw)[0] || null,
                messages: parseRawRows(msgRaw).sort((a, b) => a.id - b.id),
            };
        }

        case Methods.SESSION_RENAME: {
            await lux
                .table('sessions')
                .update(params.id, { name: params.name, updated_at: Date.now() });
            return { ok: true, name: params.name };
        }

        case Methods.CHAT_SEND: {
            const sessionId = params.session_id;
            const content = params.content;
            const clientId = ws.data.id;

            await lux.table('messages').insert({
                session_id: sessionId,
                role: 'user',
                content,
                tool_call_id: '',
                tool_name: '',
                created_at: Date.now(),
                token_estimate: estimateTokens(content),
            });

            const messageId = Date.now();
            runAgentLoop(server, clientId, sessionId, messageId).catch((e) => {
                console.error('[agent] error:', e.message);
                server.sendTo(clientId, Notifications.CHAT_DONE, {
                    session_id: sessionId,
                    message_id: messageId,
                    error: e.message,
                });
            });

            return { message_id: messageId, status: 'processing' };
        }

        case Methods.MEMORY_ADD: {
            const id = await lux.table('memories').insert({
                content: params.content,
                source: params.source || 'user',
                category: params.category || 'general',
                created_at: Date.now(),
            });
            return { id };
        }

        case Methods.MEMORY_SEARCH: {
            return { results: [] };
        }

        // --- Workstreams ---

        case Methods.WORKSTREAM_CREATE: {
            const name = params.name || `workstream-${Date.now()}`;
            const id = await lux.table('workstreams').insert({
                name,
                meta: JSON.stringify({}),
                active: 1,
                created_at: Date.now(),
                updated_at: Date.now(),
            });
            return { id, name };
        }

        case Methods.WORKSTREAM_LIST: {
            const all = await lux.table('workstreams').run();
            return {
                workstreams: all
                    .map((w) => ({ ...w, meta: safeParseMeta(w.meta) }))
                    .sort(
                        (a, b) => ((b.updated_at as number) || 0) - ((a.updated_at as number) || 0)
                    ),
            };
        }

        case Methods.WORKSTREAM_GET: {
            // TGET for single row by ID (can't WHERE on id in Lux)
            const wsRaw = (await lux.call('TGET', 'workstreams', String(params.id))) as any[];
            if (!wsRaw || wsRaw.length === 0) throw new Error(`Workstream ${params.id} not found`);
            // TGET returns [field, val, field, val...] — no leading id
            const ws: Record<string, any> = { id: Number(params.id) };
            for (let i = 0; i < wsRaw.length - 1; i += 2) {
                ws[String(wsRaw[i])] = wsRaw[i + 1];
            }

            const msgRaw = (await lux.call(
                'TQUERY',
                'messages',
                'WHERE',
                'session_id',
                '=',
                String(params.id)
            )) as any[];
            const messages = parseRawRows(msgRaw).sort((a, b) => a.id - b.id);

            return { workstream: { ...ws, meta: safeParseMeta(ws.meta) }, messages };
        }

        case Methods.WORKSTREAM_RENAME: {
            await lux
                .table('workstreams')
                .update(params.id, { name: params.name, updated_at: Date.now() });
            return { ok: true, name: params.name };
        }

        case Methods.WORKSTREAM_ARCHIVE: {
            await lux.table('workstreams').update(params.id, { active: 0, updated_at: Date.now() });
            return { ok: true };
        }

        case Methods.WORKSTREAM_UPDATE_META: {
            const wsRaw2 = (await lux.call('TGET', 'workstreams', String(params.id))) as any[];
            const ws: Record<string, any> = { id: Number(params.id) };
            for (let i = 0; i < (wsRaw2?.length || 0) - 1; i += 2)
                ws[String(wsRaw2[i])] = wsRaw2[i + 1];
            if (!ws.name) throw new Error(`Workstream ${params.id} not found`);
            const existing = safeParseMeta(ws.meta);
            const updated = { ...existing, ...(params.meta as Record<string, string>) };
            await lux
                .table('workstreams')
                .update(params.id, { meta: JSON.stringify(updated), updated_at: Date.now() });
            return { ok: true, meta: updated };
        }

        // --- Voice ---

        case Methods.VOICE_TTS: {
            const config = loadConfig();
            const audio = await textToSpeech(config, String(params.text), {
                voice: params.voice as string,
                speed: params.speed as number,
            });
            return { audio: audio.toString('base64'), format: 'wav' };
        }

        case Methods.VOICE_SEND: {
            const config = loadConfig();
            const audioBuffer = Buffer.from(String(params.audio), 'base64');
            const text = await speechToText(config, audioBuffer, String(params.format || 'wav'));
            return { text };
        }

        case Methods.VOICE_VOICES: {
            const config = loadConfig();
            const voices = await listVoices(config);
            return { voices };
        }

        // --- Model ---

        case Methods.MODEL_INFO: {
            const config = loadConfig();
            return {
                provider: config.provider,
                model:
                    config.provider === 'openrouter' && config.openrouter
                        ? config.openrouter.model
                        : config.ollama.model,
                openrouterAvailable: !!config.openrouter?.apiKey,
            };
        }

        case Methods.MODEL_SWITCH: {
            // Switch provider at runtime — recreates the agent
            const newProvider = String(params.provider || 'ollama');
            const newModel = params.model ? String(params.model) : undefined;
            // Update config in memory (won't persist to file)
            const config = loadConfig();
            if (newProvider === 'openrouter' && !config.openrouter?.apiKey) {
                throw new Error("OpenRouter API key not configured. Run 'vesuvio setup'.");
            }
            (config as any).provider = newProvider;
            if (newModel) {
                if (newProvider === 'openrouter' && config.openrouter)
                    config.openrouter.model = newModel;
                else config.ollama.model = newModel;
            }
            // Recreate agent with new config
            agent = new VesuvioAgent(config);
            return {
                provider: newProvider,
                model:
                    newModel ||
                    (newProvider === 'openrouter' ? config.openrouter?.model : config.ollama.model),
            };
        }

        default:
            throw new Error(`Unknown method: ${req.method}`);
    }
}

async function runAgentLoop(
    server: DaemonServer,
    clientId: string,
    sessionId: number,
    messageId: number
) {
    const lux = getLux();
    const vesuvio = getAgent();

    // Load conversation history
    const rawResult = (await lux.call(
        'TQUERY',
        'messages',
        'WHERE',
        'session_id',
        '=',
        String(sessionId)
    )) as any[];
    const history = parseRawRows(rawResult).sort((a, b) => a.id - b.id);

    // Load history into Magma via addMessage (creates proper MagmaMessage objects)
    vesuvio.clearMessages();
    for (const m of history) {
        if (m.role === 'user' || m.role === 'assistant') {
            vesuvio.addMessage({
                role: m.role as 'user' | 'assistant',
                content: String(m.content),
            });
        }
    }

    // Wire callbacks for streaming to client
    let fullResponse = '';
    vesuvio.setCallbacks({
        onToken: (token) => {
            fullResponse += token;
            server.sendTo(clientId, Notifications.CHAT_TOKEN, {
                session_id: sessionId,
                message_id: messageId,
                content: token,
            });
        },
        onToolStart: (tool, args, callId) => {
            server.sendTo(clientId, Notifications.CHAT_TOOL_START, {
                session_id: sessionId,
                tool,
                args,
                call_id: callId,
            });
        },
        onToolEnd: (callId, result, error) => {
            const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
            server.sendTo(clientId, Notifications.CHAT_TOOL_END, {
                session_id: sessionId,
                call_id: callId,
                result: resultStr.slice(0, 500),
                error,
            });
        },
        onDone: () => {},
        onWorkstreamSwitch: (wsId: number) => {
            server.sendTo(clientId, Notifications.WORKSTREAM_SWITCH, { workstream_id: wsId });
        },
    });

    const startTime = Date.now();
    const response = await vesuvio.main();
    const elapsed = (Date.now() - startTime) / 1000;
    const content = fullResponse || response?.content || '(no response)';

    // If streaming didn't fire (non-streaming response), send as one chunk
    if (!fullResponse && content !== '(no response)') {
        server.sendTo(clientId, Notifications.CHAT_TOKEN, {
            session_id: sessionId,
            message_id: messageId,
            content,
        });
    }

    // Store in Lux
    await lux.table('messages').insert({
        session_id: sessionId,
        role: 'assistant',
        content,
        tool_call_id: '',
        tool_name: '',
        created_at: Date.now(),
        token_estimate: estimateTokens(content),
    });

    const tokens = estimateTokens(content);
    const tps = elapsed > 0 ? Math.round((tokens / elapsed) * 10) / 10 : 0;

    server.sendTo(clientId, Notifications.CHAT_DONE, {
        session_id: sessionId,
        message_id: messageId,
        tokens,
        tps,
        elapsed,
    });
}

function safeParseMeta(meta: any): Record<string, string> {
    if (!meta) return {};
    if (typeof meta === 'object' && !Array.isArray(meta)) return meta;
    try {
        return JSON.parse(String(meta));
    } catch {
        return {};
    }
}

function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

function parseRawRows(raw: any[]): Array<Record<string, any> & { id: number }> {
    if (!raw || !Array.isArray(raw) || raw.length === 0) return [];
    return raw.map((item: any) => {
        if (!Array.isArray(item)) return { id: 0, ...item };
        const row: Record<string, any> & { id: number } = {
            id: parseInt(String(item[0]), 10) || 0,
        };
        for (let i = 1; i < item.length - 1; i += 2) {
            const key = String(item[i]);
            row[key] = item[i + 1];
        }
        return row;
    });
}
