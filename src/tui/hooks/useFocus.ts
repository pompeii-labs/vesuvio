import { useState, useEffect, useRef } from 'react';
import { useInput } from 'ink';

/**
 * Detects terminal window focus/blur.
 *
 * Enables \x1b[?1004h focus reporting, then catches the residual
 * [I / [O that Ink passes through after eating the \x1b prefix.
 *
 * The useInput hook sees these as key.escape=true with input "[I" or "[O".
 * We intercept that and suppress it from reaching other handlers.
 */
export function useWindowFocus(): boolean {
    const [focused, setFocused] = useState(true);
    const suppressRef = useRef(false);

    // Enable focus reporting
    useEffect(() => {
        if (!process.stdin.isTTY) return;
        process.stdout.write('\x1b[?1004h');
        return () => {
            process.stdout.write('\x1b[?1004l');
        };
    }, []);

    // Catch the escape sequence fragments
    // When Ink gets \x1b[I, it fires useInput with key.escape=true
    // and the remaining chars come as subsequent input events
    useInput((input, key) => {
        // After an escape, Ink sends the bracket+letter as regular input
        if (input === '[I' || (input === 'I' && suppressRef.current)) {
            setFocused(true);
            suppressRef.current = false;
            return;
        }
        if (input === '[O' || (input === 'O' && suppressRef.current)) {
            setFocused(false);
            suppressRef.current = false;
            return;
        }
        // Lone [ after escape — next char will be I or O
        if (input === '[' && key.escape) {
            suppressRef.current = true;
            return;
        }
        suppressRef.current = false;
    });

    return focused;
}
