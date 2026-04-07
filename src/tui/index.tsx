import React from 'react';
import { render } from 'ink';
import { App } from './App';
import { DAEMON_PORT } from '../shared';

const args = process.argv.slice(2);
const host = args.find((a) => a.startsWith('--host='))?.split('=')[1] || 'localhost';
const port = Number(args.find((a) => a.startsWith('--port='))?.split('=')[1] || DAEMON_PORT);

const instance = render(<App host={host} port={port} />, {
    exitOnCtrlC: false,
    patchConsole: true,
});

instance.waitUntilExit().then(() => {
    process.exit(0);
});
process.on('SIGINT', () => {
    process.exit(0);
});
process.on('SIGTERM', () => {
    process.exit(0);
});
