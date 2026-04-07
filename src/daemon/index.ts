import chalk from 'chalk';
import { VERSION, Keys } from '../shared';
import { loadConfig } from './config';
import { initLux, getLux } from '../services/lux';
import { DaemonServer } from './server';
import { createHandler } from './handler';

const brand = chalk.hex('#cba6f7').bold;
const dim = chalk.hex('#6c7086');
const ok = chalk.hex('#a6e3a1');

async function main() {
    console.log(`${brand('vesuviod')} ${dim(`v${VERSION}`)}`);

    const config = loadConfig();
    console.log(dim(`model: ${config.ollama.model}`));
    console.log(dim(`provider: ${config.provider}`));
    console.log(dim(`lux: ${config.lux.host}:${config.lux.port}`));

    await initLux(config.lux.host, config.lux.port);

    const server = new DaemonServer();
    server.onRequest(createHandler(server));
    server.start(config.port);

    const lux = getLux();
    await lux.hset(Keys.STATE_DAEMON, {
        status: 'running',
        version: VERSION,
        model:
            config.provider === 'openrouter' && config.openrouter
                ? config.openrouter.model
                : config.ollama.model,
        port: String(config.port),
        started_at: new Date().toISOString(),
    });

    console.log(ok('ready'));
}

main().catch((e) => {
    console.error(chalk.hex('#f38ba8')(`fatal: ${e.message}`));
    process.exit(1);
});
