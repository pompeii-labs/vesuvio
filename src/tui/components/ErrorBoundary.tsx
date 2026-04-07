import React from 'react';
import { Box, Text } from 'ink';

interface Props {
    children: React.ReactNode;
}

interface State {
    error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(_error: Error) {
        // Don't crash — just show the error
    }

    render() {
        if (this.state.error) {
            return (
                <Box flexDirection="column" padding={1}>
                    <Text color="#f38ba8" bold>
                        vesuvio encountered an error:
                    </Text>
                    <Text color="#f38ba8">{this.state.error.message}</Text>
                    <Text color="#6c7086" dimColor>
                        press any key to continue
                    </Text>
                </Box>
            );
        }
        return this.props.children;
    }
}
