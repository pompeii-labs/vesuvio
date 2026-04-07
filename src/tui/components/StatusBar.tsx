import React from 'react';
import { Box, Text, Spacer } from 'ink';
import { theme } from '../theme';

interface StatusBarProps {
    workstreamName: string;
    tokenCount: number;
    tps: number;
    model: string;
    connected: boolean;
    voiceEnabled?: boolean;
    voiceRecording?: boolean;
}

export function StatusBar({
    workstreamName,
    tokenCount,
    tps,
    model,
    connected,
    voiceEnabled,
    voiceRecording,
}: StatusBarProps) {
    return (
        <Box paddingX={1}>
            <Text color={connected ? theme.green : theme.red}>{connected ? '●' : '○'}</Text>
            <Text color={theme.subtext0}> {workstreamName}</Text>
            <Text color={theme.surface2}> │ </Text>
            <Text color={theme.subtext0}>{tokenCount.toLocaleString()} tok</Text>
            {tps > 0 && (
                <>
                    <Text color={theme.surface2}> │ </Text>
                    <Text color={theme.subtext0}>{tps} tok/s</Text>
                </>
            )}
            <Text color={theme.surface2}> │ </Text>
            <Text color={theme.subtext0}>{model}</Text>
            {voiceEnabled && (
                <>
                    <Text color={theme.surface2}> │ </Text>
                    {voiceRecording ? (
                        <Text color={theme.red} bold>
                            ● rec
                        </Text>
                    ) : (
                        <Text color={theme.green}>voice on</Text>
                    )}
                </>
            )}
            <Spacer />
        </Box>
    );
}
