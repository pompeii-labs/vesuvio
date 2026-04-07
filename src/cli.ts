#!/usr/bin/env bun

import { Command } from 'commander';
import { VERSION } from './shared';

const program = new Command();

program
    .name('vesuvio')
    .description('Local AI agent daemon — one brain, multiple workstreams')
    .version(VERSION);

// Default action (no subcommand) — launch TUI
program
    .argument('[query]', 'optional message to send on launch')
    .option('--host <host>', 'daemon host', 'localhost')
    .option('--port <port>', 'daemon port', '7700')
    .action(async (_query, opts) => {
        process.env.VESUVIO_HOST = opts.host;
        process.env.VESUVIO_PORT = opts.port;
        await import('./tui/index');
    });

program
    .command('start')
    .description('Start the daemon')
    .option('-d, --daemon', 'run in background')
    .action(async (opts) => {
        const { default: start } = await import('./commands/start');
        await start(opts.daemon ? ['-d'] : []);
    });

program
    .command('stop')
    .description('Stop the daemon')
    .action(async () => {
        const { default: stop } = await import('./commands/stop');
        await stop([]);
    });

program
    .command('status')
    .description('Show daemon and service status')
    .action(async () => {
        const { default: status } = await import('./commands/status');
        await status([]);
    });

program
    .command('setup')
    .description('Interactive setup wizard')
    .action(async () => {
        const { default: setup } = await import('./commands/setup');
        await setup([]);
    });

program
    .command('logs')
    .description('Tail daemon logs')
    .option('-n <lines>', 'number of lines', '50')
    .action(async (opts) => {
        const { default: logs } = await import('./commands/logs');
        await logs(opts.n ? [`-n${opts.n}`] : []);
    });

program
    .command('update')
    .description('Update to the latest version')
    .option('--check', 'check for updates without installing')
    .action(async (opts) => {
        const { default: update } = await import('./commands/update');
        await update(opts.check ? ['--check'] : []);
    });

program.parseAsync().catch((err) => {
    const { ui } = require('./shared');
    console.error(ui.error(`fatal: ${err.message}`));
    process.exit(1);
});
