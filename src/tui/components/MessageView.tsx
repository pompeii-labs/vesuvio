import React from 'react';
import { Box, Text } from 'ink';
import { theme, glyphs } from '../theme';
import { ToolCallView } from './ToolCall';
import type { DisplayMessage } from '../types';

interface MessageViewProps {
    message: DisplayMessage;
    width: number;
}

export function MessageView({ message, width }: MessageViewProps) {
    switch (message.type) {
        case 'user':
            return (
                <Box flexDirection="column" marginTop={1}>
                    <Text color={theme.blue} bold>
                        {glyphs.prompt} {message.content}
                    </Text>
                </Box>
            );

        case 'assistant':
            return (
                <Box flexDirection="column" marginTop={1}>
                    {/* Tool calls first */}
                    {message.turnItems
                        ?.filter((t) => t.type === 'tool' && t.tool)
                        .map((t) => (
                            <ToolCallView key={t.tool!.id} tool={t.tool!} />
                        ))}
                    {/* Then text content */}
                    {message.content && (
                        <Box marginLeft={2}>
                            <Text color={theme.text}>{message.content}</Text>
                        </Box>
                    )}
                </Box>
            );

        case 'system':
            return (
                <Box marginTop={1} marginLeft={2}>
                    <Text color={theme.overlay0} dimColor>
                        {message.content}
                    </Text>
                </Box>
            );

        default:
            return null;
    }
}
