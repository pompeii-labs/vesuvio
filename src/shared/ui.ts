import chalk from 'chalk';

// Catppuccin Mocha palette via chalk — use these everywhere instead of raw ANSI
export const ui = {
    brand: chalk.hex('#cba6f7').bold, // mauve
    text: chalk.hex('#cdd6f4'), // text
    dim: chalk.hex('#6c7086'), // overlay0
    success: chalk.hex('#a6e3a1'), // green
    error: chalk.hex('#f38ba8'), // red
    warn: chalk.hex('#f9e2af'), // yellow
    info: chalk.hex('#89b4fa'), // blue
    peach: chalk.hex('#fab387'), // peach
    subtle: chalk.hex('#585b70'), // surface2
    muted: chalk.hex('#45475a'), // surface1

    // Status icons
    ok: chalk.hex('#a6e3a1')('●'),
    fail: chalk.hex('#f38ba8')('○'),
    pending: chalk.hex('#f9e2af')('○'),
};
