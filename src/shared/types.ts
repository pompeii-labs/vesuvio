export interface Session {
    id: number;
    name: string;
    created_at: string;
    updated_at: string;
    summary: string;
    token_count: number;
    status: 'active' | 'archived';
}

export interface Workstream {
    id: number;
    name: string;
    meta: Record<string, string>; // auto-managed by Vesuvio: repo, goal, focus, etc.
    active: boolean;
    created_at: number;
    updated_at: number;
}

export interface Message {
    id: number;
    session_id: number;
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    tool_call_id?: string;
    tool_name?: string;
    created_at: string;
    token_estimate: number;
}

export interface Task {
    id: number;
    name: string;
    description: string;
    status: 'pending' | 'running' | 'done' | 'failed';
    agent_id?: string;
    session_id?: number;
    parent_task_id?: number;
    result?: string;
    created_at: string;
    completed_at?: string;
}

export interface Agent {
    id: string;
    name: string;
    role: 'primary' | 'worker';
    status: 'idle' | 'thinking' | 'executing';
    current_task_id?: number;
    created_at: string;
}

export interface Watcher {
    id: number;
    type: 'file' | 'cron' | 'ksub';
    path?: string;
    pattern?: string;
    event_type?: string;
    prompt: string;
    interval?: number;
    active: boolean;
    created_at: string;
}

export interface DaemonState {
    version: string;
    uptime: number;
    model: string;
    agents: Agent[];
    gpu_temp?: number[];
    connected_clients: number;
}
