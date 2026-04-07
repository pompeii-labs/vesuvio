import type { ServerWebSocket } from 'bun';
import {
    type JsonRpcMessage,
    type JsonRpcRequest,
    isRequest,
    createResponse,
    createError,
    createNotification,
    Methods,
} from '../shared';

type ClientData = { id: string };

type RequestHandler = (ws: ServerWebSocket<ClientData>, req: JsonRpcRequest) => Promise<unknown>;

export class DaemonServer {
    private clients = new Map<string, ServerWebSocket<ClientData>>();
    private handler: RequestHandler | null = null;
    private server: ReturnType<typeof Bun.serve> | null = null;

    onRequest(handler: RequestHandler) {
        this.handler = handler;
    }

    start(port: number) {
        this.server = Bun.serve<ClientData>({
            port,
            hostname: '0.0.0.0',

            fetch: (req, server) => {
                const url = new URL(req.url);

                if (url.pathname === '/health') {
                    return new Response(
                        JSON.stringify({ status: 'ok', clients: this.clients.size }),
                        { headers: { 'Content-Type': 'application/json' } }
                    );
                }

                if (req.headers.get('upgrade') === 'websocket') {
                    const id = crypto.randomUUID();
                    const ok = server.upgrade(req, { data: { id } });
                    if (ok) return undefined;
                    return new Response('WebSocket upgrade failed', { status: 500 });
                }

                return new Response('Vesuvio Daemon', { status: 200 });
            },

            websocket: {
                open: (ws) => {
                    this.clients.set(ws.data.id, ws);
                },

                message: async (ws, raw) => {
                    let msg: JsonRpcMessage;
                    try {
                        msg = JSON.parse(
                            typeof raw === 'string' ? raw : new TextDecoder().decode(raw)
                        );
                    } catch {
                        ws.send(JSON.stringify(createError(0, -32700, 'Parse error')));
                        return;
                    }

                    if (!isRequest(msg)) return;

                    if (msg.method === Methods.PING) {
                        ws.send(
                            JSON.stringify(
                                createResponse(msg.id, { pong: true, timestamp: Date.now() })
                            )
                        );
                        return;
                    }

                    if (!this.handler) {
                        ws.send(
                            JSON.stringify(createError(msg.id, -32603, 'No handler registered'))
                        );
                        return;
                    }

                    try {
                        const result = await this.handler(ws, msg);
                        ws.send(JSON.stringify(createResponse(msg.id, result)));
                    } catch (e: any) {
                        ws.send(
                            JSON.stringify(
                                createError(msg.id, -32603, e.message || 'Internal error')
                            )
                        );
                    }
                },

                close: (ws) => {
                    this.clients.delete(ws.data.id);
                },
            },
        });

        return this.server;
    }

    sendTo(clientId: string, method: string, params?: Record<string, unknown>) {
        const ws = this.clients.get(clientId);
        if (ws) {
            ws.send(JSON.stringify(createNotification(method, params)));
        }
    }

    broadcast(method: string, params?: Record<string, unknown>) {
        const msg = JSON.stringify(createNotification(method, params));
        for (const ws of this.clients.values()) {
            ws.send(msg);
        }
    }

    get clientCount() {
        return this.clients.size;
    }
}
