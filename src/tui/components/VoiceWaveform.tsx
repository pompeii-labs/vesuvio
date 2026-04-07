import React, { useState, useEffect } from 'react';
import { Text } from 'ink';

const theme = {
    green: '#a6e3a1',
    peach: '#fab387',
    red: '#f38ba8',
    overlay0: '#6c7086',
    mauve: '#cba6f7',
    yellow: '#f9e2af',
    blue: '#89b4fa',
};

// Block characters for waveform bars at different heights
const BARS = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

interface Props {
    level: number; // 0-100 current RMS level
    speaking: boolean; // is user speaking
    isThinking: boolean; // is agent thinking
    width: number;
}

export function VoiceWaveform({ level, speaking, isThinking, width }: Props) {
    const [history, setHistory] = useState<number[]>([]);
    const [_frame, setFrame] = useState(0);

    // Update history with current level
    useEffect(() => {
        const timer = setInterval(() => {
            setHistory((prev) => {
                const next = [...prev, level].slice(-(width - 10));
                return next;
            });
            setFrame((f) => f + 1);
        }, 80);
        return () => clearInterval(timer);
    }, [level, width]);

    // Build waveform visualization
    const barWidth = Math.max(1, width - 10);
    const bars = history.slice(-barWidth);

    // Pad with zeros if not enough history yet
    while (bars.length < barWidth) bars.unshift(0);

    const waveform = bars
        .map((v) => {
            const idx = Math.min(BARS.length - 1, Math.round((v / 100) * (BARS.length - 1)));
            return BARS[idx];
        })
        .join('');

    const statusText = isThinking ? 'thinking' : speaking ? 'listening' : 'ready';

    const statusColor = isThinking ? theme.yellow : speaking ? theme.red : theme.green;

    const barColor = speaking ? theme.peach : theme.overlay0;

    return (
        <Text>
            <Text color={statusColor} bold>
                {speaking ? '●' : '○'}{' '}
            </Text>
            <Text color={barColor}>{waveform}</Text>
            <Text color={statusColor}> {statusText}</Text>
        </Text>
    );
}
