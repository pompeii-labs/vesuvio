// JSON-RPC 2.0 types

export interface JsonRpcRequest {
    jsonrpc: '2.0';
    id: string | number;
    method: string;
    params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: string | number;
    result?: unknown;
    error?: { code: number; message: string; data?: unknown };
}

export interface JsonRpcNotification {
    jsonrpc: '2.0';
    method: string;
    params?: Record<string, unknown>;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

// --- Request methods (client → daemon) ---

export const Methods = {
    // Chat
    CHAT_SEND: 'chat.send',
    CHAT_CANCEL: 'chat.cancel',

    // Sessions (legacy)
    SESSION_CREATE: 'session.create',
    SESSION_LIST: 'session.list',
    SESSION_GET: 'session.get',
    SESSION_DELETE: 'session.delete',
    SESSION_RENAME: 'session.rename',

    // Workstreams
    WORKSTREAM_CREATE: 'workstream.create',
    WORKSTREAM_LIST: 'workstream.list',
    WORKSTREAM_GET: 'workstream.get',
    WORKSTREAM_RENAME: 'workstream.rename',
    WORKSTREAM_ARCHIVE: 'workstream.archive',
    WORKSTREAM_UPDATE_META: 'workstream.updateMeta',

    // Agents
    AGENT_LIST: 'agent.list',
    AGENT_SPAWN: 'agent.spawn',

    // Voice
    VOICE_TOGGLE: 'voice.toggle',
    VOICE_SEND: 'voice.send', // STT: send audio, get text
    VOICE_TTS: 'voice.tts', // TTS: send text, get audio
    VOICE_VOICES: 'voice.voices', // list available voices

    // Watchers
    WATCHER_CREATE: 'watcher.create',
    WATCHER_LIST: 'watcher.list',
    WATCHER_DELETE: 'watcher.delete',

    // Memory
    MEMORY_SEARCH: 'memory.search',
    MEMORY_ADD: 'memory.add',

    // Config
    CONFIG_GET: 'config.get',
    CONFIG_SET: 'config.set',

    // Model
    MODEL_INFO: 'model.info',
    MODEL_SWITCH: 'model.switch',

    // System
    PING: 'ping',
    STATE: 'state',
} as const;

// --- Notification methods (daemon → client) ---

export const Notifications = {
    CHAT_TOKEN: 'chat.token',
    CHAT_TOOL_START: 'chat.tool_start',
    CHAT_TOOL_END: 'chat.tool_end',
    CHAT_DONE: 'chat.done',
    AGENT_STATUS: 'agent.status',
    STATE_UPDATE: 'state.update',
    PROACTIVE_ALERT: 'proactive.alert',
    WORKSTREAM_SWITCH: 'workstream.switch',
    VOICE_AUDIO: 'voice.audio',
} as const;

// --- Helper to create messages ---

let _id = 0;

export function createRequest(method: string, params?: Record<string, unknown>): JsonRpcRequest {
    return { jsonrpc: '2.0', id: ++_id, method, params };
}

export function createResponse(id: string | number, result: unknown): JsonRpcResponse {
    return { jsonrpc: '2.0', id, result };
}

export function createError(id: string | number, code: number, message: string): JsonRpcResponse {
    return { jsonrpc: '2.0', id, error: { code, message } };
}

export function createNotification(
    method: string,
    params?: Record<string, unknown>
): JsonRpcNotification {
    return { jsonrpc: '2.0', method, params };
}

export function isRequest(msg: JsonRpcMessage): msg is JsonRpcRequest {
    return 'id' in msg && 'method' in msg;
}

export function isResponse(msg: JsonRpcMessage): msg is JsonRpcResponse {
    return 'id' in msg && !('method' in msg);
}

export function isNotification(msg: JsonRpcMessage): msg is JsonRpcNotification {
    return !('id' in msg) && 'method' in msg;
}
