import { MagmaAgent } from '@pompeii-labs/magma';
import { tool, toolparam, middleware } from '@pompeii-labs/magma/decorators';
import type {
    MagmaToolCall,
    MagmaSystemMessageType,
    MagmaStreamChunk,
} from '@pompeii-labs/magma/types';
import OpenAI from 'openai';
import { execSync } from 'child_process';
import { readFile, writeFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import type { DaemonConfig } from '../daemon/config';
import { buildSystemPrompt } from './system-prompt';
import { addMemory, searchMemory, deleteMemory, listMemories } from '../services/memory';

interface VesuvioCallbacks {
    onToken?: (content: string) => void;
    onToolStart?: (tool: string, args: Record<string, unknown>, callId: string) => void;
    onToolEnd?: (callId: string, result: string, error?: string) => void;
    onDone?: (content: string) => void;
    onWorkstreamSwitch?: (workstreamId: number) => void;
}

export class VesuvioAgent extends MagmaAgent {
    private config: DaemonConfig;
    private callbacks: VesuvioCallbacks = {};
    private cwd: string;
    private responseBuffer = '';

    // ── Lifecycle ──────────────────────────────────────────────────

    constructor(config: DaemonConfig) {
        const isOpenRouter = config.provider === 'openrouter' && config.openrouter?.apiKey;

        const client = new OpenAI({
            apiKey: isOpenRouter ? config.openrouter!.apiKey : 'vesuvio',
            baseURL: isOpenRouter
                ? 'https://openrouter.ai/api/v1'
                : `http://${config.ollama.host}:${config.ollama.port}/v1`,
            timeout: isOpenRouter ? 120_000 : 600_000,
            maxRetries: isOpenRouter ? 2 : 0,
            defaultHeaders: isOpenRouter ? { 'X-Title': 'Vesuvio' } : undefined,
        });

        super({
            provider: 'openai',
            model: isOpenRouter ? config.openrouter!.model : config.ollama.model,
            client,
            settings: { temperature: 0.7 },
            stream: !!isOpenRouter,
            messageContext: -1,
        });

        this.config = config;
        this.cwd = homedir();
    }

    setCallbacks(cb: VesuvioCallbacks) {
        this.callbacks = cb;
    }

    clearMessages() {
        (this as any).messages = [];
    }

    getSystemPrompts(): MagmaSystemMessageType[] {
        return [{ role: 'system', content: buildSystemPrompt(this.config) }];
    }

    // ── Streaming ─────────────────────────────────────────────────

    async onStreamChunk(chunk: MagmaStreamChunk | null) {
        if (chunk === null) {
            this.callbacks.onDone?.(this.responseBuffer);
            this.responseBuffer = '';
            return;
        }
        const text = chunk.delta?.content || '';
        if (text) {
            this.responseBuffer += text;
            this.callbacks.onToken?.(text);
        }
    }

    // ── Middleware ─────────────────────────────────────────────────

    @middleware('preToolExecution', { order: 1 })
    async onToolCallStart(toolCall: MagmaToolCall) {
        this.callbacks.onToolStart?.(toolCall.fn_name, toolCall.fn_args, toolCall.id);
        return toolCall;
    }

    @middleware('onToolExecution', { order: 1 })
    async onToolCallEnd(result: any) {
        const output =
            typeof result?.result === 'string' ? result.result : String(result?.result ?? result);
        const error = result?.error ? String(result.error) : undefined;
        this.callbacks.onToolEnd?.(result?.id || 'unknown', output, error);
        return result;
    }

    // ── Filesystem tools ──────────────────────────────────────────

    @tool({ name: 'bash', description: 'Execute a shell command and return the output.' })
    @toolparam({ key: 'command', type: 'string', required: true, description: 'The command' })
    async runBash(call: MagmaToolCall): Promise<string> {
        const { command } = call.fn_args;
        try {
            const output = execSync(command, {
                encoding: 'utf-8',
                timeout: 30_000,
                cwd: this.cwd,
                maxBuffer: 1024 * 1024,
                env: { ...process.env, HOME: homedir() },
            });
            const trimmed = output.trim();
            return trimmed.length > 10_000
                ? trimmed.slice(0, 10_000) + '\n...(truncated)'
                : trimmed || '(no output)';
        } catch (e: any) {
            const stderr = e.stderr?.toString().trim() || '';
            const stdout = e.stdout?.toString().trim() || '';
            return `Exit code ${e.status}\n${stderr || stdout || e.message}`.slice(0, 5000);
        }
    }

    @tool({ name: 'read_file', description: 'Read the contents of a file.' })
    @toolparam({ key: 'path', type: 'string', required: true, description: 'File path' })
    async readFileTool(call: MagmaToolCall): Promise<string> {
        const resolved = this.resolvePath(call.fn_args.path);
        try {
            const content = await readFile(resolved, 'utf-8');
            return content.length > 20_000
                ? content.slice(0, 20_000) + `\n...(truncated, ${content.length} chars total)`
                : content || '(empty file)';
        } catch (e: any) {
            return `Error: ${e.message}`;
        }
    }

    @tool({ name: 'write_file', description: 'Write content to a file.' })
    @toolparam({ key: 'path', type: 'string', required: true, description: 'File path' })
    @toolparam({ key: 'content', type: 'string', required: true, description: 'Content to write' })
    async writeFileTool(call: MagmaToolCall): Promise<string> {
        const { content } = call.fn_args;
        const resolved = this.resolvePath(call.fn_args.path);
        try {
            await writeFile(resolved, content, 'utf-8');
            return `Written ${content.length} bytes to ${resolved}`;
        } catch (e: any) {
            return `Error: ${e.message}`;
        }
    }

    @tool({ name: 'list_files', description: 'List files and directories at a path.' })
    @toolparam({ key: 'path', type: 'string', required: false, description: 'Directory path' })
    async listFiles(call: MagmaToolCall): Promise<string> {
        const dirPath = this.resolvePath(call.fn_args.path || '.');
        try {
            const entries = await readdir(dirPath, { withFileTypes: true });
            return (
                entries.map((e) => `${e.isDirectory() ? '📁 ' : '   '}${e.name}`).join('\n') ||
                '(empty)'
            );
        } catch (e: any) {
            return `Error: ${e.message}`;
        }
    }

    @tool({ name: 'search', description: 'Search for text patterns in files using grep.' })
    @toolparam({ key: 'pattern', type: 'string', required: true, description: 'Search pattern' })
    @toolparam({ key: 'path', type: 'string', required: false, description: 'Directory to search' })
    async searchFiles(call: MagmaToolCall): Promise<string> {
        const { pattern } = call.fn_args;
        const searchPath = this.resolvePath(call.fn_args.path || '.');
        try {
            const output = execSync(
                `grep -rn --include='*' -l "${pattern.replace(/"/g, '\\"')}" "${searchPath}" 2>/dev/null | head -20`,
                { encoding: 'utf-8', timeout: 10_000, maxBuffer: 512 * 1024 }
            );
            return output.trim() || 'No matches found';
        } catch {
            return 'No matches found';
        }
    }

    @tool({ name: 'cd', description: 'Change the current working directory.' })
    @toolparam({ key: 'path', type: 'string', required: true, description: 'Directory path' })
    async changeDir(call: MagmaToolCall): Promise<string> {
        const newPath = this.resolvePath(call.fn_args.path);
        if (!existsSync(newPath)) return `Directory does not exist: ${newPath}`;
        this.cwd = newPath;
        return `Changed directory to ${newPath}`;
    }

    // ── Web tools ─────────────────────────────────────────────────

    @tool({ name: 'fetch', description: 'Fetch a URL and return its text content.' })
    @toolparam({ key: 'url', type: 'string', required: true, description: 'URL to fetch' })
    async fetchUrl(call: MagmaToolCall): Promise<string> {
        try {
            const res = await fetch(String(call.fn_args.url), {
                headers: { 'User-Agent': 'Vesuvio/0.1' },
                signal: AbortSignal.timeout(15_000),
            });
            if (!res.ok) return `HTTP ${res.status}: ${res.statusText}`;
            const text = await res.text();
            const clean = text
                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            return clean.length > 15_000
                ? clean.slice(0, 15_000) + '\n...(truncated)'
                : clean || '(empty)';
        } catch (e: any) {
            return `Fetch error: ${e.message}`;
        }
    }

    @tool({ name: 'web_search', description: 'Search the web for information.' })
    @toolparam({ key: 'query', type: 'string', required: true, description: 'Search query' })
    async webSearch(call: MagmaToolCall): Promise<string> {
        const { query } = call.fn_args;
        const tavilyKey = this.config.tavily?.apiKey || process.env.TAVILY_API_KEY;

        if (tavilyKey) {
            return this.searchTavily(String(query), tavilyKey);
        }
        return this.searchDuckDuckGo(String(query));
    }

    // ── Memory tools ──────────────────────────────────────────────

    @tool({ name: 'remember', description: 'Store a fact or note to memory for later recall.' })
    @toolparam({ key: 'content', type: 'string', required: true, description: 'Text to remember' })
    async remember(call: MagmaToolCall): Promise<string> {
        const content = String(call.fn_args.content || '');
        if (!content) return 'Error: no content provided';
        const id = await addMemory(this.config, content, 'agent', 'general');
        return `Stored memory #${id}: "${content.slice(0, 50)}"`;
    }

    @tool({ name: 'recall', description: 'Search memories by semantic similarity.' })
    @toolparam({ key: 'query', type: 'string', required: true, description: 'What to search for' })
    @toolparam({ key: 'limit', type: 'number', required: false, description: 'Max results' })
    async recall(call: MagmaToolCall): Promise<string> {
        const query = String(call.fn_args.query || '');
        if (!query) return 'Error: no query provided';
        const results = await searchMemory(this.config, query, Number(call.fn_args.limit) || 5);
        if (results.length === 0) return 'No matching memories found.';
        return results
            .map((r) => `[#${r.memory.id} ${(r.similarity * 100).toFixed(0)}%] ${r.memory.content}`)
            .join('\n');
    }

    @tool({ name: 'forget', description: 'Delete a memory by ID.' })
    @toolparam({ key: 'id', type: 'number', required: true, description: 'Memory ID' })
    async forget(call: MagmaToolCall): Promise<string> {
        const id = Number(call.fn_args.id || call.fn_args.memory_id);
        if (!id) return 'Error: no memory ID provided';
        const ok = await deleteMemory(id);
        return ok ? `Deleted memory #${id}` : `Memory #${id} not found`;
    }

    @tool({ name: 'memories', description: 'List all stored memories.' })
    async listMems(_call: MagmaToolCall): Promise<string> {
        const mems = await listMemories(20);
        if (mems.length === 0) return 'No memories stored.';
        return mems.map((m) => `[#${m.id} ${m.category}] ${m.content.slice(0, 80)}`).join('\n');
    }

    // ── Workstream tools ──────────────────────────────────────────

    @tool({ name: 'list_workstreams', description: 'List all active workstreams.' })
    async listWorkstreams(_call: MagmaToolCall): Promise<string> {
        const { getLux } = await import('../services/lux');
        const all = await getLux().table('workstreams').run();
        const active = all.filter((w) => w.active !== false && w.active !== 0 && w.active !== '0');
        if (active.length === 0) return 'No active workstreams.';
        return active.map((w) => `[#${w.id}] ${w.name}`).join('\n');
    }

    @tool({ name: 'switch_workstream', description: 'Switch to a different workstream.' })
    @toolparam({
        key: 'name',
        type: 'string',
        required: true,
        description: 'Workstream name or ID',
    })
    async switchWorkstream(call: MagmaToolCall): Promise<string> {
        const target = String(call.fn_args.name).toLowerCase();
        const { getLux } = await import('../services/lux');
        const all = await getLux().table('workstreams').run();
        const match = all.find(
            (w) => w.name?.toString().toLowerCase().includes(target) || String(w.id) === target
        );
        if (!match) return `No workstream matching "${target}".`;
        this.callbacks.onWorkstreamSwitch?.(match.id as number);
        return `Switching to workstream "${match.name}" (#${match.id})`;
    }

    // ── Private helpers ───────────────────────────────────────────

    private resolvePath(path: string): string {
        let p = String(path || '.');
        if (p.startsWith('~/')) p = join(homedir(), p.slice(2));
        return resolve(this.cwd, p);
    }

    private async searchTavily(query: string, apiKey: string): Promise<string> {
        try {
            const res = await fetch('https://api.tavily.com/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_key: apiKey,
                    query,
                    search_depth: 'basic',
                    include_answer: true,
                    max_results: 5,
                }),
                signal: AbortSignal.timeout(15_000),
            });
            if (!res.ok) throw new Error(`Tavily ${res.status}`);
            const data = (await res.json()) as any;
            let result = '';
            if (data.answer) result += `Answer: ${data.answer}\n\n`;
            if (data.results?.length > 0) {
                result += 'Sources:\n';
                for (const r of data.results.slice(0, 5)) {
                    result += `- ${r.title}\n  ${r.content?.slice(0, 200)}\n  ${r.url}\n\n`;
                }
            }
            return result || 'No results found.';
        } catch (e: any) {
            return `Tavily error: ${e.message}`;
        }
    }

    private async searchDuckDuckGo(query: string): Promise<string> {
        try {
            const encoded = encodeURIComponent(query);
            const res = await fetch(`https://html.duckduckgo.com/html/?q=${encoded}`, {
                headers: { 'User-Agent': 'Vesuvio/0.1' },
                signal: AbortSignal.timeout(10_000),
            });
            const html = await res.text();
            const results: string[] = [];
            const regex =
                /<a rel="nofollow" class="result__a" href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
            let match;
            while ((match = regex.exec(html)) && results.length < 5) {
                const title = match[2].replace(/<[^>]+>/g, '').trim();
                const snippet = match[3].replace(/<[^>]+>/g, '').trim();
                results.push(`- ${title}\n  ${snippet}\n  ${match[1]}`);
            }
            return results.length > 0 ? results.join('\n\n') : 'No results found';
        } catch (e: any) {
            return `Search error: ${e.message}`;
        }
    }
}
