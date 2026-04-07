import { getLux } from './lux';
import type { DaemonConfig } from '../daemon/config';

const EMBED_MODEL = 'nomic-embed-text';

export interface Memory {
    id: number;
    content: string;
    source: string;
    category: string;
    created_at: number;
}

export interface MemorySearchResult {
    memory: Memory;
    similarity: number;
}

async function embed(config: DaemonConfig, text: string): Promise<number[]> {
    const res = await fetch(`http://${config.ollama.host}:${config.ollama.port}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: EMBED_MODEL, input: text }),
    });
    if (!res.ok) throw new Error(`Embed failed: ${res.status}`);
    const data = (await res.json()) as { embeddings: number[][] };
    return data.embeddings?.[0] || [];
}

export async function addMemory(
    config: DaemonConfig,
    content: string,
    source: string = 'agent',
    category: string = 'general'
): Promise<number> {
    const lux = getLux();

    // Store in table
    const id = await lux.table('memories').insert({
        content,
        source,
        category,
        created_at: Date.now(),
    });

    // Generate embedding and store in Lux vectors
    try {
        const vector = await embed(config, content);
        if (vector.length > 0) {
            await lux.vectors.set(`mem:${id}`, vector, {
                memory_id: id,
                content,
                category,
                source,
            });
        }
    } catch (e: any) {
        console.error(`[memory] embedding failed for memory ${id}: ${e.message}`);
    }

    return id;
}

export async function searchMemory(
    config: DaemonConfig,
    query: string,
    limit: number = 5
): Promise<MemorySearchResult[]> {
    const lux = getLux();

    // Embed query
    const queryVector = await embed(config, query);
    if (queryVector.length === 0) return [];

    // Search Lux vectors — metadata contains everything we need
    const results = await lux.vectors.search(queryVector, {
        topK: limit,
        meta: true,
    });

    return results
        .filter((r) => r.metadata?.content)
        .map((r) => ({
            memory: {
                id: Number(r.metadata?.memory_id || 0),
                content: String(r.metadata?.content || ''),
                source: String(r.metadata?.source || ''),
                category: String(r.metadata?.category || ''),
                created_at: 0,
            },
            similarity: r.similarity,
        }));
}

export async function deleteMemory(id: number): Promise<boolean> {
    const lux = getLux();
    try {
        await lux.table('memories').delete(id);
        await lux.call('DEL', `mem:${id}`);
        return true;
    } catch {
        return false;
    }
}

export async function listMemories(limit: number = 20): Promise<Memory[]> {
    const lux = getLux();
    const rows = await lux.table('memories').limit(limit).run();
    return rows.map((r) => ({
        id: r.id,
        content: String(r.content || ''),
        source: String(r.source || ''),
        category: String(r.category || ''),
        created_at: Number(r.created_at) || 0,
    }));
}
