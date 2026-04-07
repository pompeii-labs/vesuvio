import React, { useReducer, useCallback } from 'react';
import { Text, useInput } from 'ink';
import { theme } from '../theme';

interface ChatInputProps {
    value: string;
    onChange: (val: string) => void;
    onSubmit: (val: string) => void;
    placeholder?: string;
    focus?: boolean;
}

function findWordLeft(text: string, pos: number): number {
    if (pos <= 0) return 0;
    let i = pos - 1;
    while (i > 0 && text[i] === ' ') i--;
    while (i > 0 && text[i - 1] !== ' ') i--;
    return i;
}

function findWordRight(text: string, pos: number): number {
    if (pos >= text.length) return text.length;
    let i = pos;
    while (i < text.length && text[i] !== ' ') i++;
    while (i < text.length && text[i] === ' ') i++;
    return i;
}

type State = { text: string; cursor: number };
type Action =
    | { type: 'insert'; char: string }
    | { type: 'backspace' }
    | { type: 'deleteWord' }
    | { type: 'deleteWordForward' }
    | { type: 'newline' }
    | { type: 'clearToStart' }
    | { type: 'moveTo'; pos: number }
    | { type: 'moveLeft' }
    | { type: 'moveRight' }
    | { type: 'wordLeft' }
    | { type: 'wordRight' }
    | { type: 'home' }
    | { type: 'end' }
    | { type: 'set'; text: string; cursor: number };

function reducer(state: State, action: Action): State {
    const { text, cursor } = state;
    switch (action.type) {
        case 'insert':
            return {
                text: text.slice(0, cursor) + action.char + text.slice(cursor),
                cursor: cursor + action.char.length,
            };
        case 'backspace':
            return cursor > 0
                ? { text: text.slice(0, cursor - 1) + text.slice(cursor), cursor: cursor - 1 }
                : state;
        case 'deleteWord': {
            const b = findWordLeft(text, cursor);
            return { text: text.slice(0, b) + text.slice(cursor), cursor: b };
        }
        case 'deleteWordForward': {
            const b = findWordRight(text, cursor);
            return { text: text.slice(0, cursor) + text.slice(b), cursor };
        }
        case 'newline':
            return { text: text.slice(0, cursor) + '\n' + text.slice(cursor), cursor: cursor + 1 };
        case 'clearToStart':
            return { text: text.slice(cursor), cursor: 0 };
        case 'moveTo':
            return { ...state, cursor: Math.max(0, Math.min(text.length, action.pos)) };
        case 'moveLeft':
            return cursor > 0 ? { ...state, cursor: cursor - 1 } : state;
        case 'moveRight':
            return cursor < text.length ? { ...state, cursor: cursor + 1 } : state;
        case 'wordLeft':
            return { ...state, cursor: findWordLeft(text, cursor) };
        case 'wordRight':
            return { ...state, cursor: findWordRight(text, cursor) };
        case 'home':
            return { ...state, cursor: 0 };
        case 'end':
            return { ...state, cursor: text.length };
        case 'set':
            return { text: action.text, cursor: action.cursor };
        default:
            return state;
    }
}

export function ChatInput({
    value,
    onChange,
    onSubmit,
    placeholder = '',
    focus = true,
}: ChatInputProps) {
    const [state, dispatch] = useReducer(reducer, { text: value, cursor: value.length });

    // Sync external value if it changed (e.g. after submit clears it)
    if (value !== state.text && value === '') {
        dispatch({ type: 'set', text: '', cursor: 0 });
    }

    const sync = useCallback(
        (s: State) => {
            onChange(s.text);
        },
        [onChange]
    );

    useInput(
        (input, key) => {
            if (!focus) return;

            // Shift+Enter — newline
            if (key.return && key.shift) {
                dispatch({ type: 'newline' });
                onChange(state.text.slice(0, state.cursor) + '\n' + state.text.slice(state.cursor));
                return;
            }

            // Enter — submit
            if (key.return) {
                if (state.text.trim()) {
                    onSubmit(state.text);
                    dispatch({ type: 'set', text: '', cursor: 0 });
                    onChange('');
                }
                return;
            }

            // Alt+Backspace / Option+Delete — delete word backward
            // Mac terminals send this as escape+backspace, so check both meta and escape
            if ((key.backspace || key.delete) && (key.meta || key.escape)) {
                dispatch({ type: 'deleteWord' });
                onChange(
                    state.text.slice(0, findWordLeft(state.text, state.cursor)) +
                        state.text.slice(state.cursor)
                );
                return;
            }

            // Backspace
            if (key.backspace || key.delete) {
                dispatch({ type: 'backspace' });
                onChange(state.text.slice(0, state.cursor - 1) + state.text.slice(state.cursor));
                return;
            }

            if (key.ctrl && input === 'w') {
                dispatch({ type: 'deleteWord' });
                sync(state);
                return;
            }
            if (key.ctrl && input === 'u') {
                dispatch({ type: 'clearToStart' });
                sync(state);
                return;
            }
            if (key.ctrl && input === 'a') {
                dispatch({ type: 'home' });
                return;
            }
            if (key.ctrl && input === 'e') {
                dispatch({ type: 'end' });
                return;
            }
            if (key.leftArrow && key.meta) {
                dispatch({ type: 'wordLeft' });
                return;
            }
            if (key.rightArrow && key.meta) {
                dispatch({ type: 'wordRight' });
                return;
            }
            if (key.leftArrow) {
                dispatch({ type: 'moveLeft' });
                return;
            }
            if (key.rightArrow) {
                dispatch({ type: 'moveRight' });
                return;
            }

            if (input && !key.ctrl && !key.meta && !key.escape) {
                // Filter escape sequence remnants (focus events, mouse events)
                const clean = input.replace(/\[?[IO]/g, '').replace(/\[<\d+;\d+;\d+[mM]/g, '');
                if (clean && !clean.includes('[<')) {
                    dispatch({ type: 'insert', char: clean });
                    onChange(
                        state.text.slice(0, state.cursor) + clean + state.text.slice(state.cursor)
                    );
                }
            }
        },
        { isActive: focus }
    );

    const { text, cursor } = state;
    const before = text.slice(0, cursor);
    const cursorChar = text[cursor] || ' ';
    const after = text.slice(cursor + 1);

    return (
        <Text>
            <Text color={focus ? theme.peach : theme.overlay0} bold={focus}>
                {'> '}
            </Text>
            <Text color={theme.text}>{before}</Text>
            {focus ? (
                <Text backgroundColor={theme.text} color={theme.base}>
                    {cursorChar}
                </Text>
            ) : (
                <Text color={theme.text}>{cursorChar}</Text>
            )}
            <Text color={theme.text}>{after}</Text>
        </Text>
    );
}
