import {
    type JsonRpcRequest,
    type JsonRpcResponse,
    type JsonRpcNotification,
    createRequest,
    isResponse,
    isNotification,
} from './shared';

type NotificationHandler = (params: Record<string, unknown>) => void;

export class DaemonConnection {
    private ws: WebSocket | null = null;
    private pending = new Map<
        string | number,
        { resolve: (v: unknown) => void; reject: (e: Error) => void }
    >();
    private listeners = new Map<string, Set<NotificationHandler>>();
    private url: string;
    private reconnectTimer: Timer | null = null;
    private _connected = false;

    constructor(host: string, port: number) {
        this.url = `ws://${host}:${port}`;
    }

    get connected() {
        return this._connected;
    }

    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.url);

            this.ws.onopen = () => {
                this._connected = true;
                resolve();
            };

            this.ws.onerror = (e) => {
                if (!this._connected) reject(new Error(`Failed to connect to ${this.url}`));
            };

            this.ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(String(event.data));

                    if (isResponse(msg)) {
                        const p = this.pending.get(msg.id);
                        if (p) {
                            this.pending.delete(msg.id);
                            if (msg.error) {
                                p.reject(new Error(msg.error.message));
                            } else {
                                p.resolve(msg.result);
                            }
                        }
                    } else if (isNotification(msg)) {
                        const handlers = this.listeners.get(msg.method);
                        if (handlers) {
                            for (const h of handlers) {
                                h((msg.params || {}) as Record<string, unknown>);
                            }
                        }
                    }
                } catch {
                    // ignore parse errors
                }
            };

            this.ws.onclose = () => {
                this._connected = false;
                // Reject all pending requests
                for (const [, p] of this.pending) {
                    p.reject(new Error('Connection closed'));
                }
                this.pending.clear();

                // Auto-reconnect
                this.reconnectTimer = setTimeout(() => this.connect().catch(() => {}), 3000);
            };
        });
    }

    async request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
        if (!this.ws || !this._connected) {
            throw new Error('Not connected');
        }

        const req = createRequest(method, params);
        return new Promise((resolve, reject) => {
            this.pending.set(req.id, {
                resolve: resolve as (v: unknown) => void,
                reject,
            });
            this.ws!.send(JSON.stringify(req));

            // Timeout after 30s
            setTimeout(() => {
                if (this.pending.has(req.id)) {
                    this.pending.delete(req.id);
                    reject(new Error(`Request timed out: ${method}`));
                }
            }, 30000);
        });
    }

    on(method: string, handler: NotificationHandler) {
        if (!this.listeners.has(method)) {
            this.listeners.set(method, new Set());
        }
        this.listeners.get(method)!.add(handler);
        return () => this.listeners.get(method)?.delete(handler);
    }

    close() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.ws?.close();
        this._connected = false;
    }
}
