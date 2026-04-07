import { Lux } from '@luxdb/sdk';
import { Tables, Keys } from '../shared';

export class LuxService {
    private client: Lux | null = null;
    private sub: Lux | null = null;

    async connect(host = 'localhost', port = 6379): Promise<Lux> {
        this.client = new Lux(`redis://${host}:${port}`);
        this.sub = new Lux(`redis://${host}:${port}`);

        await new Promise<void>((resolve, reject) => {
            this.client!.on('ready', resolve);
            this.client!.on('error', reject);
        });

        for (const table of Object.values(Tables)) {
            try {
                await this.client.call('TCREATE', table.name, ...table.schema.split(' '));
            } catch (e: any) {
                if (!e.message?.includes('already exists')) {
                    console.error(`[lux] table ${table.name}: ${e.message}`);
                }
            }
        }

        await this.client.hset(Keys.STATE_DAEMON, {
            status: 'starting',
            started_at: String(Date.now()),
        });

        return this.client;
    }

    get db(): Lux {
        if (!this.client) throw new Error('Lux not connected');
        return this.client;
    }

    get subscriber(): Lux {
        if (!this.sub) throw new Error('Lux not connected');
        return this.sub;
    }

    async shutdown() {
        await this.client?.quit();
        await this.sub?.quit();
    }
}

// Singleton for backward compat — will refactor callers incrementally
const instance = new LuxService();

export async function initLux(host = 'localhost', port = 6379) {
    return instance.connect(host, port);
}

export function getLux() {
    return instance.db;
}

export function getLuxSub() {
    return instance.subscriber;
}

export async function shutdownLux() {
    return instance.shutdown();
}
