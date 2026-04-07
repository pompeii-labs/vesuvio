// Single flat timeline — everything is a TimelineItem in order
export type TimelineItem =
    | { type: 'user'; id: string; content: string }
    | { type: 'assistant'; id: string; content: string }
    | { type: 'system'; id: string; content: string }
    | {
          type: 'tool_start';
          id: string;
          toolId: string;
          name: string;
          args: Record<string, unknown>;
          result?: string;
          error?: string;
      }
    | { type: 'tool_end'; id: string; toolId: string; result: string; error?: string }
    | { type: 'streaming'; id: string; content: string }
    | { type: 'thinking'; id: string };

export interface ToolDisplay {
    id: string;
    name: string;
    args: Record<string, unknown>;
    status: 'running' | 'complete' | 'error';
    result?: string;
    error?: string;
}

// Keep DisplayMessage for backward compat but prefer TimelineItem
export interface DisplayMessage {
    id: string;
    type: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    turnItems?: any[];
}

export interface Tab {
    id: number;
    name: string;
    messages: DisplayMessage[];
    unread: boolean;
}

export interface Notification {
    id: string;
    type: 'proactive' | 'watcher' | 'error';
    content: string;
    timestamp: number;
    read: boolean;
}

// Format tool args like Claude Code: Bash("ls -la")
export function formatToolCall(
    name: string,
    args: Record<string, unknown>
): { displayName: string; displayArgs: string } {
    const capName = name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' ');
    const vals = Object.values(args);
    let displayArgs: string;
    if (vals.length === 1 && typeof vals[0] === 'string') {
        displayArgs = `"${String(vals[0]).slice(0, 60)}"`;
    } else if (vals.length === 0) {
        displayArgs = '';
    } else {
        displayArgs = Object.entries(args)
            .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
            .join(', ')
            .slice(0, 70);
    }
    return { displayName: capName, displayArgs };
}
