import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Text, Static, useInput, useApp, useStdout } from 'ink';
import Spinner from 'ink-spinner';
import { theme } from './theme';
import { type TimelineItem } from './types';
import { DaemonConnection } from '../connect';
import { VERSION, Methods, Notifications } from '../shared';
import { ChatInput } from './components/ChatInput';
import { StatusBar } from './components/StatusBar';
import { TimelineItemView } from './components/TimelineItemView';
import { Volcano, VolcanoErupt } from './components/Volcano';
import { VoiceWaveform } from './components/VoiceWaveform';
import { speak } from '../voice';
import { ContinuousVAD } from '../vad';
import { handleCommand } from './commands';

const SLASH_COMMANDS = [
    'work',
    'new',
    'rename',
    'help',
    'clear',
    'voice',
    'voices',
    'say',
    'model',
    'streaming',
    'erupt',
    'quit',
];

interface AppProps {
    host: string;
    port: number;
}

export function App({ host, port }: AppProps) {
    const { exit } = useApp();
    const { stdout } = useStdout();
    const termWidth = stdout?.columns || 80;

    const connRef = useRef<DaemonConnection | null>(null);
    const [connected, setConnected] = useState(false);
    const [model, setModel] = useState('');
    const [workstreamId, setWorkstreamId] = useState(0);
    const [workstreamName, setWorkstreamName] = useState('');

    // Timeline: finalized items go to Static (never re-render), live items render below
    const [history, setHistory] = useState<TimelineItem[]>([]);
    const [liveItems, setLiveItems] = useState<TimelineItem[]>([]);

    const [input, _setInput] = useState('');
    const inputRef = useRef('');
    const setInput = useCallback((v: string) => {
        inputRef.current = v;
        _setInput(v);
    }, []);

    // Streaming
    const streamingRef = useRef('');
    const throttleRef = useRef<Timer | null>(null);
    const [streamingText, setStreamingText] = useState('');
    const [streamingEnabled, setStreamingEnabled] = useState(true);
    const [isThinking, setIsThinking] = useState(false);

    // TPS
    const tokenCountRef = useRef(0);
    const streamStartRef = useRef(0);
    const [tokenCount, setTokenCount] = useState(0);
    const [tps, setTps] = useState(0);

    // Interaction mode
    const [interactionMode, setInteractionMode] = useState<'input' | 'picker' | 'voicePicker'>(
        'input'
    );
    const [pickerItems, setPickerItems] = useState<any[]>([]);
    const [pickerIndex, setPickerIndex] = useState(0);

    // Voice
    const [voiceEnabled, setVoiceEnabled] = useState(false);
    const [voiceRecording, setVoiceRecording] = useState(false);
    const [voiceLevel, setVoiceLevel] = useState(0);
    const voiceEnabledRef = useRef(false);
    const vadRef = useRef<ContinuousVAD | null>(null);
    const voiceVoiceRef = useRef('af_heart');

    const lastCtrlCRef = useRef(0);
    const [showEruption, setShowEruption] = useState(true);
    const [inlineErupt, setInlineErupt] = useState(false);

    // --- Connect ---
    useEffect(() => {
        const conn = new DaemonConnection(host, port);
        connRef.current = conn;

        conn.connect()
            .then(async () => {
                setConnected(true);
                const state = await conn.request<Record<string, string>>(Methods.STATE);
                setModel(state.model || 'unknown');

                const wsList = await conn.request<any>(Methods.WORKSTREAM_LIST);
                const active = (wsList.workstreams || []).filter(
                    (w: any) => w.active !== false && w.active !== 0 && w.active !== '0'
                );
                if (active.length > 0) {
                    const latest = active[0];
                    setWorkstreamId(latest.id);
                    setWorkstreamName(latest.name);
                    try {
                        const res = await conn.request<any>(Methods.WORKSTREAM_GET, {
                            id: latest.id,
                        });
                        const items: TimelineItem[] = (res.messages || []).map((m: any) => ({
                            type:
                                m.role === 'user'
                                    ? ('user' as const)
                                    : m.role === 'assistant'
                                      ? ('assistant' as const)
                                      : ('system' as const),
                            id: `loaded-${m.id}`,
                            content: String(m.content || ''),
                        }));
                        setHistory(items);
                    } catch {}
                } else {
                    const ws = await conn.request<{ id: number; name: string }>(
                        Methods.WORKSTREAM_CREATE,
                        { name: 'default' }
                    );
                    setWorkstreamId(ws.id);
                    setWorkstreamName(ws.name);
                }
            })
            .catch(() => setConnected(false));

        // --- Notifications ---
        conn.on(Notifications.CHAT_TOKEN, (params) => {
            let token = String(params.content || '');
            token = token.replace(/<channel\|>/g, '').replace(/<\|[^>]*\|>/g, '');
            token = token.replace(/\$\\rightarrow\$/g, '→').replace(/\$\\([a-zA-Z]+)\$/g, '');
            if (!token) return;

            if (!streamStartRef.current) {
                streamStartRef.current = Date.now();
                setLiveItems((prev) => prev.filter((i) => i.type !== 'thinking'));
            }
            streamingRef.current += token;
            tokenCountRef.current++;

            if (!throttleRef.current) {
                throttleRef.current = setTimeout(() => {
                    throttleRef.current = null;
                    if (streamingEnabled) setStreamingText(streamingRef.current);
                    setIsThinking(false);
                    const elapsed = (Date.now() - streamStartRef.current) / 1000;
                    if (elapsed > 0)
                        setTps(Math.round((tokenCountRef.current / elapsed) * 10) / 10);
                    setTokenCount(tokenCountRef.current);
                }, 80);
            }
        });

        conn.on(Notifications.CHAT_TOOL_START, (params) => {
            if (streamingRef.current) {
                const text = streamingRef.current;
                streamingRef.current = '';
                setStreamingText('');
                setLiveItems((prev) => [
                    ...prev.filter((i) => i.type !== 'thinking'),
                    { type: 'assistant', id: `a-${Date.now()}`, content: text },
                ]);
            }
            setLiveItems((prev) => [
                ...prev.filter((i) => i.type !== 'thinking'),
                {
                    type: 'tool_start',
                    id: `ts-${params.call_id}`,
                    toolId: String(params.call_id),
                    name: String(params.tool),
                    args: (params.args || {}) as Record<string, unknown>,
                },
            ]);
        });

        conn.on(Notifications.CHAT_TOOL_END, (params) => {
            const callId = String(params.call_id);
            const result = String(params.result || '');
            const error = params.error ? String(params.error) : undefined;
            setLiveItems((prev) => {
                const updated = prev
                    .filter((i) => i.type !== 'thinking')
                    .map((item) =>
                        item.type === 'tool_start' && item.toolId === callId
                            ? { ...item, result, error }
                            : item
                    );
                updated.push({ type: 'thinking', id: `think-${Date.now()}` });
                return updated;
            });
            setIsThinking(true);
        });

        conn.on(Notifications.CHAT_DONE, (params) => {
            // TPS from daemon
            if (params.tokens) setTokenCount((prev) => prev + (params.tokens as number));
            if (params.tps) setTps(params.tps as number);
            const finalText = streamingRef.current;
            const currentLive = liveItemsRef.current;

            // Flush everything to history (Static)
            const toFlush: TimelineItem[] = [...currentLive.filter((i) => i.type !== 'thinking')];
            if (finalText) {
                toFlush.push({ type: 'assistant', id: `a-${Date.now()}`, content: finalText });
            }
            if (toFlush.length > 0) {
                setHistory((prev) => [...prev, ...toFlush]);
            }

            setLiveItems([]);
            streamingRef.current = '';
            streamStartRef.current = 0;
            tokenCountRef.current = 0;
            setStreamingText('');
            setIsThinking(false);
            if (throttleRef.current) {
                clearTimeout(throttleRef.current);
                throttleRef.current = null;
            }

            // Auto-speak
            if (voiceEnabledRef.current && finalText && conn) {
                vadRef.current?.mute();
                speak(conn, finalText, voiceVoiceRef.current)
                    .then(() => vadRef.current?.unmute())
                    .catch(() => vadRef.current?.unmute());
            }
        });

        conn.on(Notifications.WORKSTREAM_SWITCH, (params) => {
            const wsId = params.workstream_id as number;
            if (wsId) loadWorkstream(wsId).catch(() => {});
        });

        return () => {
            conn.close();
            if (throttleRef.current) clearTimeout(throttleRef.current);
        };
    }, [host, port]);

    const liveItemsRef = useRef(liveItems);
    liveItemsRef.current = liveItems;

    // --- Load workstream ---
    const loadWorkstream = useCallback(async (id: number) => {
        try {
            if (!connRef.current) return;
            const res = await connRef.current.request<any>(Methods.WORKSTREAM_GET, { id });
            setWorkstreamId(id);
            setWorkstreamName(res.workstream?.name || `workstream-${id}`);
            const items: TimelineItem[] = (res.messages || []).map((m: any) => ({
                type:
                    m.role === 'user'
                        ? ('user' as const)
                        : m.role === 'assistant'
                          ? ('assistant' as const)
                          : ('system' as const),
                id: `loaded-${m.id}`,
                content: String(m.content || ''),
            }));
            setHistory(items);
            setLiveItems([]);
            setInteractionMode('input');
        } catch (e: any) {
            setHistory((prev) => [
                ...prev,
                { type: 'system', id: `sys-${Date.now()}`, content: `error: ${e.message}` },
            ]);
            setInteractionMode('input');
        }
    }, []);

    // --- Submit ---
    const handleSubmit = useCallback(
        (text: string) => {
            if (!text.trim() || !connRef.current) return;

            // Try slash commands first
            if (text.trim().startsWith('/')) {
                const handled = handleCommand(text, {
                    conn: connRef.current,
                    workstreamId,
                    setWorkstreamId,
                    setWorkstreamName,
                    setHistory,
                    setLiveItems,
                    setInteractionMode,
                    setPickerItems,
                    setPickerIndex,
                    setModel,
                    setVoiceEnabled,
                    voiceEnabledRef,
                    voiceVoiceRef,
                    vadRef,
                    setVoiceRecording,
                    setVoiceLevel,
                    setIsThinking,
                    setInlineErupt,
                    setStreamingEnabled,
                    loadWorkstream,
                    exit,
                });
                if (handled) return;
            }

            // Regular message
            setHistory((prev) => [
                ...prev,
                { type: 'user', id: `u-${Date.now()}`, content: text.trim() },
            ]);
            setLiveItems([{ type: 'thinking', id: `think-${Date.now()}` }]);
            setIsThinking(true);
            setInput('');
            streamingRef.current = '';
            setStreamingText('');
            connRef.current
                .request(Methods.CHAT_SEND, { session_id: workstreamId, content: text.trim() })
                .catch(() => {});
        },
        [workstreamId, exit]
    );

    // --- Global keybinds ---
    useInput((input, key) => {
        // Skip eruption
        if (key.return && showEruption) {
            setShowEruption(false);
            return;
        }

        // Escape — interrupt
        if (key.escape && isThinking) {
            setIsThinking(false);
            setStreamingText('');
            streamingRef.current = '';
            setLiveItems([]);
            setHistory((prev) => [
                ...prev,
                { type: 'system', id: `sys-${Date.now()}`, content: 'interrupted' },
            ]);
            return;
        }

        // Mouse wheel
        if (input && input.includes('[<6')) return; // swallow mouse events

        // Ctrl+Y — copy last
        if (key.ctrl && input === 'y') {
            const last = [...history].reverse().find((i) => i.type === 'assistant');
            if (last && 'content' in last) {
                const encoded = Buffer.from(last.content).toString('base64');
                process.stdout.write(`\x1b]52;c;${encoded}\x07`);
                setHistory((prev) => [
                    ...prev,
                    { type: 'system', id: `sys-${Date.now()}`, content: 'copied to clipboard' },
                ]);
            }
            return;
        }

        // Ctrl+C
        if (key.ctrl && input === 'c') {
            if (inputRef.current) {
                setInput('');
                return;
            }
            if (isThinking) {
                setIsThinking(false);
                setStreamingText('');
                streamingRef.current = '';
                setLiveItems([]);
                setHistory((prev) => [
                    ...prev,
                    { type: 'system', id: `sys-${Date.now()}`, content: 'interrupted' },
                ]);
                return;
            }
            const now = Date.now();
            if (now - lastCtrlCRef.current < 1500) {
                vadRef.current?.stop();
                connRef.current?.close();
                exit();
            }
            lastCtrlCRef.current = now;
        }

        // Picker mode (workstreams or voices)
        if (interactionMode === 'picker' || interactionMode === 'voicePicker') {
            if (key.upArrow) {
                setPickerIndex((i) => Math.max(0, i - 1));
                return;
            }
            if (key.downArrow) {
                setPickerIndex((i) => Math.min(pickerItems.length - 1, i + 1));
                return;
            }
            if (key.return && pickerItems[pickerIndex]) {
                if (interactionMode === 'voicePicker') {
                    const voice = pickerItems[pickerIndex].name;
                    voiceVoiceRef.current = voice;
                    setInteractionMode('input');
                    setHistory((prev) => [
                        ...prev,
                        { type: 'system', id: `sys-${Date.now()}`, content: `voice: ${voice}` },
                    ]);
                    if (connRef.current)
                        speak(connRef.current, `Voice set to ${voice}`, voice).catch(() => {});
                } else {
                    setInteractionMode('input');
                    loadWorkstream(pickerItems[pickerIndex].id).catch(() => {});
                }
                return;
            }
            if (key.escape) {
                setInteractionMode('input');
                return;
            }
            return;
        }
    });

    // Slash menu
    const slashMatches =
        input.startsWith('/') && !isThinking
            ? SLASH_COMMANDS.filter((c) => c.startsWith(input.slice(1).toLowerCase()))
            : [];

    // --- Render ---

    if (!connected || showEruption) {
        return (
            <Box flexDirection="column" padding={1}>
                {showEruption ? (
                    <Volcano onDone={() => setShowEruption(false)} />
                ) : (
                    <Text color={theme.overlay0}>
                        <Spinner type="dots" /> connecting to {host}:{port}...
                    </Text>
                )}
            </Box>
        );
    }

    return (
        <Box flexDirection="column">
            {/* Header — scrolls away with content */}
            {history.length === 0 && liveItems.length === 0 && (
                <Box flexDirection="column" paddingX={1} marginBottom={1}>
                    <Text bold color={theme.mauve}>
                        vesuvio
                    </Text>
                    <Text color={theme.overlay0}>
                        {model} · v{VERSION} · /help for commands
                    </Text>
                </Box>
            )}

            {/* History — Static: rendered once, never re-rendered. Terminal handles scrollback. */}
            <Static items={history}>
                {(item) => (
                    <Box key={item.id} paddingX={1}>
                        <TimelineItemView item={item} width={termWidth - 4} />
                    </Box>
                )}
            </Static>

            {/* Live area — current turn: tools, streaming, thinking */}
            <Box flexDirection="column" paddingX={1}>
                {liveItems.map((item, i) => (
                    <TimelineItemView
                        key={item.id}
                        item={item}
                        width={termWidth - 4}
                        prevType={i > 0 ? liveItems[i - 1].type : undefined}
                    />
                ))}

                {streamingText && (
                    <Box marginTop={1} marginLeft={2}>
                        <Text color={theme.text}>{streamingText}▌</Text>
                    </Box>
                )}

                {inlineErupt && (
                    <Box marginTop={1} justifyContent="center">
                        <VolcanoErupt onDone={() => setInlineErupt(false)} />
                    </Box>
                )}
            </Box>

            {/* Voice waveform */}
            {voiceEnabled && (
                <Box paddingX={2}>
                    <VoiceWaveform
                        level={voiceLevel}
                        speaking={voiceRecording}
                        isThinking={isThinking}
                        width={termWidth - 6}
                    />
                </Box>
            )}

            {/* Interaction area */}
            <Box paddingX={1}>
                <Text color={theme.surface1}>{'─'.repeat(termWidth - 2)}</Text>
            </Box>
            <Box paddingX={1}>
                {interactionMode === 'picker' || interactionMode === 'voicePicker' ? (
                    <Box flexDirection="column">
                        <Text>
                            <Text color={theme.mauve} bold>
                                {interactionMode === 'voicePicker' ? 'voices' : 'workstreams'}{' '}
                            </Text>
                            <Text color={theme.overlay0} dimColor>
                                ↑↓ · enter · esc
                            </Text>
                        </Text>
                        {pickerItems.map((w: any, i: number) => (
                            <Text key={w.id}>
                                <Text color={i === pickerIndex ? theme.peach : theme.overlay0}>
                                    {i === pickerIndex ? '> ' : '  '}
                                </Text>
                                <Text
                                    color={i === pickerIndex ? theme.text : theme.subtext0}
                                    bold={i === pickerIndex}
                                >
                                    {w.name}
                                </Text>
                            </Text>
                        ))}
                    </Box>
                ) : (
                    <Box flexDirection="column">
                        <ChatInput
                            value={input}
                            onChange={setInput}
                            onSubmit={handleSubmit}
                            focus={interactionMode === 'input'}
                        />
                        {slashMatches.length > 0 && (
                            <Box flexDirection="column" marginTop={0} paddingLeft={2}>
                                {slashMatches.slice(0, 6).map((cmd) => (
                                    <Text key={cmd}>
                                        <Text color={theme.mauve} bold>
                                            /{cmd}
                                        </Text>
                                    </Text>
                                ))}
                            </Box>
                        )}
                    </Box>
                )}
            </Box>

            {/* Status */}
            <Box paddingX={1}>
                <Text color={theme.surface0}>{'─'.repeat(termWidth - 2)}</Text>
            </Box>
            <StatusBar
                workstreamName={workstreamName}
                tokenCount={tokenCount}
                tps={tps}
                model={model}
                connected={connected}
                voiceEnabled={voiceEnabled}
                voiceRecording={voiceRecording}
            />
        </Box>
    );
}
