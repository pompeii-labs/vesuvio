// Lux table definitions and key patterns

export const Tables = {
    SESSIONS: {
        name: 'sessions',
        schema: 'name:str created_at:timestamp updated_at:timestamp summary:str token_count:int status:str',
    },
    WORKSTREAMS: {
        name: 'workstreams',
        schema: 'name:str meta:str active:bool created_at:timestamp updated_at:timestamp',
    },
    MESSAGES: {
        name: 'messages',
        schema: 'session_id:int role:str content:str tool_call_id:str tool_name:str created_at:timestamp token_estimate:int',
    },
    TASKS: {
        name: 'tasks',
        schema: 'name:str description:str status:str agent_id:str session_id:int parent_task_id:int result:str created_at:timestamp completed_at:timestamp',
    },
    AGENTS: {
        name: 'agents',
        schema: 'name:str role:str status:str current_task_id:int created_at:timestamp',
    },
    WATCHERS: {
        name: 'watchers',
        schema: 'type:str path:str pattern:str event_type:str prompt:str interval:int active:bool created_at:timestamp',
    },
    MEMORIES: {
        name: 'memories',
        schema: 'content:str source:str category:str created_at:timestamp',
    },
} as const;

// Key patterns
export const Keys = {
    // State keys (KSUB-able)
    STATE_DAEMON: 'vesuvio:state:daemon',
    STATE_AGENTS: 'vesuvio:state:agents',
    STATE_GPU: 'vesuvio:state:gpu',

    // Pub/sub channels
    sessionChannel: (id: number) => `vesuvio:session:${id}`,
    BROADCAST: 'vesuvio:broadcast',

    // Streams
    EVENTS: 'vesuvio:events',
    agentStream: (id: string) => `vesuvio:agent:${id}`,

    // Locks and queues
    OLLAMA_LOCK: 'vesuvio:lock:ollama',
    TASK_QUEUE: 'vesuvio:queue:tasks',

    // Config
    CONFIG: 'vesuvio:config',

    // Vector keys
    memoryVector: (id: number) => `mem:${id}`,
} as const;
