import { Methods } from '../shared';
import { speak } from '../voice';
import { ContinuousVAD } from '../vad';
import type { DaemonConnection } from '../connect';
import type { TimelineItem } from './types';

interface CommandContext {
    conn: DaemonConnection;
    workstreamId: number;
    setWorkstreamId: (id: number) => void;
    setWorkstreamName: (name: string) => void;
    setHistory: (fn: (prev: TimelineItem[]) => TimelineItem[]) => void;
    setLiveItems: (fn: (prev: TimelineItem[]) => TimelineItem[]) => void;
    setInteractionMode: (mode: 'input' | 'picker' | 'voicePicker') => void;
    setPickerItems: (items: any[]) => void;
    setPickerIndex: (i: number) => void;
    setModel: (m: string) => void;
    setVoiceEnabled: (v: boolean) => void;
    voiceEnabledRef: { current: boolean };
    voiceVoiceRef: { current: string };
    vadRef: { current: ContinuousVAD | null };
    setVoiceRecording: (v: boolean) => void;
    setVoiceLevel: (v: number) => void;
    setIsThinking: (v: boolean) => void;
    setInlineErupt: (v: boolean) => void;
    setStreamingEnabled: (fn: (prev: boolean) => boolean) => void;
    loadWorkstream: (id: number) => Promise<void>;
    exit: () => void;
}

type CommandHandler = (text: string, ctx: CommandContext) => boolean;

function sysMsg(content: string): TimelineItem {
    return { type: 'system', id: `sys-${Date.now()}`, content };
}

const commands: CommandHandler[] = [
    // /quit
    (text, ctx) => {
        const cmd = text.trim().toLowerCase();
        if (cmd === '/quit' || cmd === '/q' || cmd === '/exit') {
            ctx.vadRef.current?.stop();
            ctx.conn.close();
            ctx.exit();
            return true;
        }
        return false;
    },

    // /clear
    (text, ctx) => {
        const cmd = text.trim().toLowerCase();
        if (cmd === '/clear' || cmd === '/c') {
            ctx.setHistory(() => []);
            ctx.setLiveItems(() => []);
            return true;
        }
        return false;
    },

    // /help
    (text, ctx) => {
        const cmd = text.trim().toLowerCase();
        if (cmd === '/help' || cmd === '/h') {
            const COMMANDS = [
                '/work — browse workstreams',
                '/new <name> — create workstream',
                '/rename <name> — rename current',
                '/model — show/switch model',
                '/voice — toggle voice mode',
                '/voices — pick a voice',
                '/say <text> — speak text',
                '/clear — clear chat',
                '/quit — exit',
            ];
            ctx.setHistory((prev) => [...prev, sysMsg(COMMANDS.join('\n'))]);
            return true;
        }
        return false;
    },

    // /rename
    (text, ctx) => {
        if (!text.trim().toLowerCase().startsWith('/rename')) return false;
        const newName = text.trim().slice(7).trim();
        if (!newName) {
            ctx.setHistory((prev) => [...prev, sysMsg('usage: /rename <name>')]);
            return true;
        }
        ctx.conn
            .request(Methods.WORKSTREAM_RENAME, { id: ctx.workstreamId, name: newName })
            .then(() => {
                ctx.setWorkstreamName(newName);
                ctx.setHistory((prev) => [...prev, sysMsg(`renamed to "${newName}"`)]);
            })
            .catch((e: any) => ctx.setHistory((prev) => [...prev, sysMsg(`error: ${e.message}`)]));
        return true;
    },

    // /new
    (text, ctx) => {
        if (!text.trim().toLowerCase().startsWith('/new ')) return false;
        const name = text.trim().slice(4).trim();
        if (!name) return true;
        ctx.conn
            .request<{ id: number; name: string }>(Methods.WORKSTREAM_CREATE, { name })
            .then((ws) => {
                ctx.setWorkstreamId(ws.id);
                ctx.setWorkstreamName(ws.name);
                ctx.setHistory(() => [sysMsg(`workstream "${ws.name}" created`)]);
                ctx.setLiveItems(() => []);
            })
            .catch((e: any) => ctx.setHistory((prev) => [...prev, sysMsg(`error: ${e.message}`)]));
        return true;
    },

    // /work
    (text, ctx) => {
        const cmd = text.trim().toLowerCase();
        if (cmd !== '/work' && !cmd.startsWith('/work ')) return false;
        const target = text.trim().slice(5).trim().toLowerCase();
        if (target) {
            ctx.conn.request<any>(Methods.WORKSTREAM_LIST).then((res) => {
                const match = (res.workstreams || []).find(
                    (w: any) => w.name.toLowerCase().includes(target) || String(w.id) === target
                );
                if (match) ctx.loadWorkstream(match.id).catch(() => {});
                else ctx.setHistory((prev) => [...prev, sysMsg(`no workstream "${target}"`)]);
            });
            return true;
        }
        ctx.conn.request<any>(Methods.WORKSTREAM_LIST).then((res) => {
            const wss = (res.workstreams || []).filter(
                (w: any) => w.active !== false && w.active !== 0 && w.active !== '0'
            );
            if (wss.length === 0) {
                ctx.setHistory((prev) => [...prev, sysMsg('no workstreams')]);
                return;
            }
            ctx.setPickerItems(wss);
            ctx.setPickerIndex(0);
            ctx.setInteractionMode('picker');
        });
        return true;
    },

    // /archive
    (text, ctx) => {
        if (text.trim().toLowerCase() !== '/archive') return false;
        ctx.conn
            .request(Methods.WORKSTREAM_ARCHIVE, { id: ctx.workstreamId })
            .then(() => ctx.setHistory((prev) => [...prev, sysMsg('archived')]))
            .catch((e: any) => ctx.setHistory((prev) => [...prev, sysMsg(`error: ${e.message}`)]));
        return true;
    },

    // /voices
    (text, ctx) => {
        if (text.trim().toLowerCase() !== '/voices') return false;
        ctx.conn.request<any>(Methods.VOICE_VOICES).then((res) => {
            const voices = (res.voices || []).map((v: string) => ({ id: v, name: v }));
            ctx.setPickerItems(voices);
            ctx.setPickerIndex(0);
            ctx.setInteractionMode('voicePicker');
        });
        return true;
    },

    // /voice <name> — set voice
    (text, ctx) => {
        if (!text.trim().toLowerCase().startsWith('/voice ') || text.trim().length <= 7)
            return false;
        const voiceName = text.trim().slice(7).trim();
        ctx.voiceVoiceRef.current = voiceName;
        ctx.setHistory((prev) => [...prev, sysMsg(`voice set to "${voiceName}"`)]);
        speak(ctx.conn, `Voice changed to ${voiceName}`, voiceName).catch(() => {});
        return true;
    },

    // /voice — toggle
    (text, ctx) => {
        if (text.trim().toLowerCase() !== '/voice') return false;
        const next = !ctx.voiceEnabledRef.current;
        ctx.setVoiceEnabled(next);
        ctx.voiceEnabledRef.current = next;

        if (next) {
            try {
                const vad = new ContinuousVAD({
                    speechThreshold: 600,
                    silenceDuration: 1500,
                    minSpeechDuration: 600,
                    onSpeech: (audio) => {
                        ctx.setVoiceRecording(false);
                        ctx.conn
                            .request<{ text: string }>(Methods.VOICE_SEND, {
                                audio: audio.toString('base64'),
                                format: 'wav',
                            })
                            .then((res) => {
                                const garbage = [
                                    '',
                                    'you',
                                    'You',
                                    'BOOM',
                                    'Boom',
                                    'Thank you.',
                                    'Thanks for watching.',
                                    'Bye.',
                                    '.',
                                    '...',
                                ];
                                if (
                                    res.text &&
                                    res.text.length > 2 &&
                                    !garbage.includes(res.text.trim())
                                ) {
                                    ctx.setHistory((prev) => [
                                        ...prev,
                                        {
                                            type: 'user',
                                            id: `u-${Date.now()}`,
                                            content: res.text,
                                        },
                                    ]);
                                    ctx.setLiveItems(() => [
                                        { type: 'thinking', id: `think-${Date.now()}` },
                                    ]);
                                    ctx.setIsThinking(true);
                                    ctx.conn
                                        .request(Methods.CHAT_SEND, {
                                            session_id: ctx.workstreamId,
                                            content: res.text,
                                        })
                                        .catch(() => {});
                                }
                            })
                            .catch(() => {});
                    },
                    onSpeechStart: () => ctx.setVoiceRecording(true),
                    onListening: () => ctx.setVoiceRecording(false),
                    onLevel: (rms) => ctx.setVoiceLevel(Math.min(100, Math.round(rms / 300))),
                });
                vad.start();
                ctx.vadRef.current = vad;
                ctx.setHistory((prev) => [
                    ...prev,
                    sysMsg('voice mode on — hands-free, just talk'),
                ]);
            } catch (e: any) {
                ctx.setHistory((prev) => [...prev, sysMsg(`voice error: ${e.message}`)]);
                ctx.setVoiceEnabled(false);
                ctx.voiceEnabledRef.current = false;
            }
        } else {
            ctx.vadRef.current?.stop();
            ctx.vadRef.current = null;
            ctx.setVoiceRecording(false);
            ctx.setVoiceLevel(0);
            ctx.setHistory((prev) => [...prev, sysMsg('voice mode off')]);
        }
        return true;
    },

    // /say
    (text, ctx) => {
        if (!text.trim().toLowerCase().startsWith('/say ')) return false;
        const toSay = text.trim().slice(5);
        if (toSay) speak(ctx.conn, toSay, ctx.voiceVoiceRef.current).catch(() => {});
        return true;
    },

    // /erupt
    (text, ctx) => {
        if (text.trim().toLowerCase() !== '/erupt') return false;
        ctx.setInlineErupt(true);
        return true;
    },

    // /model
    (text, ctx) => {
        const cmd = text.trim().toLowerCase();
        if (cmd !== '/model' && !cmd.startsWith('/model ')) return false;
        const target = text.trim().slice(6).trim();
        if (!target) {
            ctx.conn
                .request<any>(Methods.MODEL_INFO)
                .then((res: any) => {
                    ctx.setHistory((prev) => [
                        ...prev,
                        sysMsg(
                            `provider: ${res.provider}\nmodel: ${res.model}${res.openrouterAvailable ? '\nopenrouter: available' : ''}`
                        ),
                    ]);
                })
                .catch(() => {});
            return true;
        }
        const parts = target.split(' ');
        const provider = parts[0].includes('/') ? 'openrouter' : parts[0];
        const model = parts[0].includes('/') ? parts[0] : parts[1];
        ctx.conn
            .request<any>(Methods.MODEL_SWITCH, { provider, model })
            .then((res: any) => {
                ctx.setModel(res.model);
                ctx.setHistory((prev) => [
                    ...prev,
                    sysMsg(`switched to ${res.provider}: ${res.model}`),
                ]);
            })
            .catch((e: any) => ctx.setHistory((prev) => [...prev, sysMsg(`error: ${e.message}`)]));
        return true;
    },

    // /streaming
    (text, ctx) => {
        if (text.trim().toLowerCase() !== '/streaming') return false;
        ctx.setStreamingEnabled((prev) => {
            const n = !prev;
            ctx.setHistory((h) => [...h, sysMsg(`streaming ${n ? 'on' : 'off'}`)]);
            return n;
        });
        return true;
    },
];

export function handleCommand(text: string, ctx: CommandContext): boolean {
    for (const handler of commands) {
        if (handler(text, ctx)) return true;
    }
    return false;
}
