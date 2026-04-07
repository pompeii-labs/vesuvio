import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { theme, glyphs } from '../theme';
import { formatToolCall, type TimelineItem } from '../types';
import { renderMarkdown } from '../markdown';

interface Props {
    item: TimelineItem;
    width: number;
    prevType?: string; // type of previous item for smart spacing
}

export function TimelineItemView({ item, width }: Props) {
    // Smart spacing: add gap between different "blocks" but keep tools tight
    switch (item.type) {
        case 'user':
            return (
                <Box marginTop={1} marginLeft={1} flexDirection="column">
                    <Text color={theme.blue} bold>
                        {glyphs.prompt} {item.content}
                    </Text>
                </Box>
            );

        case 'assistant': {
            const rendered = useMemo(
                () => renderMarkdown(item.content, width),
                [item.content, width]
            );
            return (
                <Box marginTop={1} marginLeft={2} flexDirection="column">
                    <Text>{rendered}</Text>
                </Box>
            );
        }

        case 'system':
            return (
                <Box marginTop={1} marginLeft={2} flexDirection="column">
                    <Text color={theme.overlay0} dimColor>
                        {item.content}
                    </Text>
                </Box>
            );

        case 'tool_start': {
            const { displayName, displayArgs } = formatToolCall(item.name, item.args);
            const isComplete = !!item.result || !!item.error;
            const result = item.result;
            const error = item.error;

            return (
                <Box marginLeft={2} marginTop={1} flexDirection="column">
                    <Box>
                        {isComplete ? (
                            <Text color={error ? theme.red : theme.green}>
                                {error ? glyphs.error : glyphs.complete}{' '}
                            </Text>
                        ) : (
                            <Text color={theme.blue}>
                                <Spinner type="dots" />{' '}
                            </Text>
                        )}
                        <Text bold color={theme.yellow}>
                            {displayName}
                        </Text>
                        {displayArgs && <Text color={theme.overlay0}>({displayArgs})</Text>}
                    </Box>
                    {isComplete && result && (
                        <Box marginLeft={4} flexDirection="column">
                            {result
                                .split('\n')
                                .filter((l: string) => l.trim())
                                .slice(0, 4)
                                .map((line: string, i: number) => (
                                    <Text key={i} color={theme.overlay0} dimColor>
                                        {line.slice(0, width - 8)}
                                    </Text>
                                ))}
                            {result.split('\n').filter((l: string) => l.trim()).length > 4 && (
                                <Text color={theme.overlay0} dimColor>
                                    ...
                                </Text>
                            )}
                        </Box>
                    )}
                    {error && (
                        <Box marginLeft={4}>
                            <Text color={theme.red}>{error}</Text>
                        </Box>
                    )}
                </Box>
            );
        }

        case 'tool_end':
            return null;

        case 'thinking':
            return (
                <Box marginTop={0} marginLeft={2}>
                    <Text color={theme.overlay0}>
                        <Spinner type="dots" /> thinking...
                    </Text>
                </Box>
            );

        default:
            return null;
    }
}
