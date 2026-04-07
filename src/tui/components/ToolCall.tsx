import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { theme, glyphs } from '../theme';
import { formatToolCall, type ToolDisplay } from '../types';

interface ToolCallProps {
    tool: ToolDisplay;
}

export function ToolCallView({ tool }: ToolCallProps) {
    const { displayName, displayArgs } = formatToolCall(tool.name, tool.args);

    const glyph =
        tool.status === 'complete'
            ? glyphs.complete
            : tool.status === 'error'
              ? glyphs.error
              : glyphs.running;

    const glyphColor =
        tool.status === 'complete' ? theme.green : tool.status === 'error' ? theme.red : theme.blue;

    return (
        <Box flexDirection="column" marginLeft={2} marginTop={0}>
            <Box>
                {tool.status === 'running' ? (
                    <Text color={theme.blue}>
                        <Spinner type="dots" />{' '}
                    </Text>
                ) : (
                    <Text color={glyphColor}>{glyph} </Text>
                )}
                <Text bold color={theme.yellow}>
                    {displayName}
                </Text>
                {displayArgs && <Text color={theme.overlay0}>({displayArgs})</Text>}
            </Box>
            {tool.result && tool.status === 'complete' && (
                <Box marginLeft={4}>
                    <Text color={theme.overlay0} dimColor>
                        {tool.result
                            .split('\n')
                            .filter((l) => l.trim())
                            .slice(0, 4)
                            .join('\n')}
                        {tool.result.split('\n').filter((l) => l.trim()).length > 4 ? '\n...' : ''}
                    </Text>
                </Box>
            )}
            {tool.error && (
                <Box marginLeft={4}>
                    <Text color={theme.red}>{tool.error}</Text>
                </Box>
            )}
        </Box>
    );
}
