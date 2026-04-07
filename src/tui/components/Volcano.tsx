import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';

const P = {
    ember: '#e64553',
    flame: '#fe640b',
    lava: '#df8e1d',
    glow: '#f9e2af',
    white: '#eff1f5',
    smoke1: '#7c7f93',
    smoke2: '#585b70',
    smoke3: '#45475a',
    rock1: '#6c7086',
    rock2: '#585b70',
    rock3: '#45475a',
    ground: '#313244',
    night: '#1e1e2e',
    mauve: '#cba6f7',
    sub: '#585b70',
};

type L = [string, string];

// Base mountain — reused in every frame
const base: L[] = [
    [`            ██▒▒░░░░░░░░░░░░▒▒██               `, P.rock3],
    [`          ██▒▒▒▒░░░░░░░░░░░░▒▒▒▒██             `, P.rock3],
    [`        ██▒▒▒▒▒▒▒▒░░░░░░░░▒▒▒▒▒▒▒▒██          `, P.ground],
    [`  ██████▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒██████    `, P.ground],
];

// Lava-streaked base for eruption frames
const lavaBase: L[] = [
    [`            ██▒▒░░░░░▓░░░░░░▒▒██               `, P.lava],
    [`          ██▒▒▒▒░░░░░▓░░░░░░▒▒▒▒██             `, P.rock3],
    [`        ██▒▒▒▒▒▒▒▒░░░▓░░░▒▒▒▒▒▒▒▒██           `, P.ground],
    [`  ██████▒▒▒▒▒▒▒▒▒▒▒▒▒▓▒▒▒▒▒▒▒▒▒▒▒▒▒██████     `, P.lava],
];

const FRAMES: L[][] = [
    // 0 — still
    [
        [`                                              `, P.night],
        [`                                              `, P.night],
        [`                                              `, P.night],
        [`                    ████                       `, P.rock1],
        [`                  ██░░░░██                     `, P.rock1],
        [`                ██░░░░░░░░██                   `, P.rock2],
        [`              ██░░░░░░░░░░░░██                 `, P.rock2],
        ...base,
    ],
    // 1 — faint smoke
    [
        [`                                              `, P.night],
        [`                                              `, P.night],
        [`                     ░                        `, P.smoke3],
        [`                    ████                       `, P.rock1],
        [`                  ██░░░░██                     `, P.rock1],
        [`                ██░░░░░░░░██                   `, P.rock2],
        [`              ██░░░░░░░░░░░░██                 `, P.rock2],
        ...base,
    ],
    // 2 — crater glows
    [
        [`                                              `, P.night],
        [`                     ░                        `, P.smoke2],
        [`                    ░░░                       `, P.smoke3],
        [`                    ████                       `, P.rock1],
        [`                  ██▒▒▒▒██                     `, P.ember],
        [`                ██░░░░░░░░██                   `, P.rock2],
        [`              ██░░░░░░░░░░░░██                 `, P.rock2],
        ...base,
    ],
    // 3 — magma rising
    [
        [`                                              `, P.night],
        [`                    ░ ░                       `, P.smoke2],
        [`                    ·▒·                       `, P.ember],
        [`                    ████                       `, P.rock1],
        [`                  ██████▓▓                     `, P.flame],
        [`                ██░░░░░░░░██                   `, P.rock2],
        [`              ██░░░░░░░░░░░░██                 `, P.rock2],
        ...base,
    ],
    // 4 — eruption begins
    [
        [`                                              `, P.night],
        [`                    *▓*                       `, P.flame],
        [`                   *███*                      `, P.flame],
        [`                    ████                       `, P.ember],
        [`                  ████████                     `, P.flame],
        [`                ██░░░▓▓░░░██                   `, P.rock2],
        [`              ██░░░░░░░░░░░░██                 `, P.rock2],
        ...base,
    ],
    // 5 — full eruption
    [
        [`                   ·*█*·                      `, P.glow],
        [`                  *█████*                     `, P.flame],
        [`                   █████                      `, P.flame],
        [`                    ████                       `, P.ember],
        [`                  ████████                     `, P.flame],
        [`                ██░░████░░██                   `, P.flame],
        [`              ██░░░░▓▓▓▓░░░░██                 `, P.rock2],
        ...lavaBase,
    ],
    // 6 — peak, lava streaming
    [
        [`                  · *█* ·                     `, P.glow],
        [`                   *███*                      `, P.white],
        [`                  *█████*                     `, P.flame],
        [`                   ▓████▓                     `, P.flame],
        [`                  ████████                     `, P.ember],
        [`                ██░░████░░██                   `, P.flame],
        [`              ██░░░░▓▓▓▓░░░░██                 `, P.lava],
        ...lavaBase,
    ],
    // 7 — winding down
    [
        [`                    ░░░                       `, P.smoke1],
        [`                   ·*█*·                      `, P.flame],
        [`                    ███                       `, P.ember],
        [`                    ████                       `, P.rock1],
        [`                  ██▓▓▓▓██                     `, P.flame],
        [`                ██░░░▓▓░░░██                   `, P.rock2],
        [`              ██░░░░░▓▓░░░░░██                 `, P.lava],
        ...lavaBase,
    ],
    // 8 — smoke rising
    [
        [`                  ░  ░  ░                     `, P.smoke1],
        [`                   ░ ░ ░                      `, P.smoke2],
        [`                    ░░░                       `, P.smoke3],
        [`                    ████                       `, P.rock1],
        [`                  ██▒▒▒▒██                     `, P.rock1],
        [`                ██░░░░░░░░██                   `, P.rock2],
        [`              ██░░░░░▒▒░░░░░██                 `, P.rock2],
        ...base,
    ],
    // 9 — calm
    [
        [`                                              `, P.night],
        [`                     ░                        `, P.smoke3],
        [`                                              `, P.night],
        [`                    ████                       `, P.rock1],
        [`                  ██░░░░██                     `, P.rock1],
        [`                ██░░░░░░░░██                   `, P.rock2],
        [`              ██░░░░░░░░░░░░██                 `, P.rock2],
        ...base,
    ],
];

// Slower buildup, hold the peak, gradual cooldown
const TIMINGS = [700, 500, 400, 350, 300, 350, 600, 400, 500, 900];

interface Props {
    onDone?: () => void;
}

export function Volcano({ onDone }: Props) {
    const [frame, setFrame] = useState(0);
    useEffect(() => {
        if (frame >= FRAMES.length) {
            onDone?.();
            return;
        }
        const t = setTimeout(() => setFrame((f) => f + 1), TIMINGS[frame] || 400);
        return () => clearTimeout(t);
    }, [frame, onDone]);
    if (frame >= FRAMES.length) return null;
    return <Render lines={FRAMES[frame]} showLabel />;
}

function Render({ lines, showLabel }: { lines: L[]; showLabel?: boolean }) {
    return (
        <Box flexDirection="column" alignItems="center">
            {lines.map(([text, color], i) => (
                <Text key={i} color={color}>
                    {text}
                </Text>
            ))}
            {showLabel && (
                <>
                    <Box marginTop={1}>
                        <Text bold color={P.mauve}>
                            v e s u v i o
                        </Text>
                    </Box>
                    <Text color={P.sub}>local ai daemon</Text>
                </>
            )}
        </Box>
    );
}

export function VolcanoStatic() {
    return <Render lines={FRAMES[0]} showLabel />;
}

export function VolcanoErupt({ onDone }: Props) {
    return <Volcano onDone={onDone} />;
}
