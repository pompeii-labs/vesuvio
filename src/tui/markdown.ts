import chalk from 'chalk';

// Catppuccin Mocha colors for chalk
const c = {
    text: chalk.hex('#cdd6f4'),
    bold: chalk.hex('#cdd6f4').bold,
    italic: chalk.hex('#bac2de').italic,
    dim: chalk.hex('#6c7086'),
    heading: chalk.hex('#cba6f7').bold, // mauve
    h1: chalk.hex('#cba6f7').bold.underline,
    h2: chalk.hex('#89b4fa').bold, // blue
    h3: chalk.hex('#94e2d5').bold, // teal
    code: chalk.hex('#a6e3a1'), // green, no background — clean and readable
    codeText: chalk.hex('#a6e3a1'), // green for code blocks
    gutter: chalk.hex('#45475a'),
    link: chalk.hex('#89b4fa').underline,
    linkUrl: chalk.hex('#585b70'),
    bullet: chalk.hex('#fab387'), // peach
    number: chalk.hex('#fab387'),
    quote: chalk.hex('#585b70').italic,
    quoteMark: chalk.hex('#45475a'),
    hr: chalk.hex('#45475a'),
    tableH: chalk.hex('#89b4fa').bold,
    tableB: chalk.hex('#45475a'),
    check: chalk.hex('#a6e3a1'), // green
    uncheck: chalk.hex('#585b70'),
};

export function renderMarkdown(text: string, width: number = 80): string {
    const lines = text.split('\n');
    const output: string[] = [];
    let inCode = false;
    let inTable = false;
    let tableRows: string[][] = [];
    let tableAligns: string[] = [];

    for (let li = 0; li < lines.length; li++) {
        const line = lines[li];

        // Code block
        if (line.trimStart().startsWith('```')) {
            if (inCode) {
                inCode = false;
                output.push(c.gutter('  └' + '─'.repeat(Math.min(width - 6, 50)) + '┘'));
                continue;
            }
            inCode = true;
            output.push(c.gutter('  ┌' + '─'.repeat(Math.min(width - 6, 50)) + '┐'));
            continue;
        }
        if (inCode) {
            output.push(c.gutter('  │ ') + c.codeText(line));
            continue;
        }

        // Table detection
        if (line.includes('|') && line.trim().startsWith('|')) {
            const cells = line
                .split('|')
                .slice(1, -1)
                .map((c) => c.trim());

            // Separator row (|---|---|)
            if (cells.every((c) => /^:?-+:?$/.test(c))) {
                tableAligns = cells.map((c) => {
                    if (c.startsWith(':') && c.endsWith(':')) return 'center';
                    if (c.endsWith(':')) return 'right';
                    return 'left';
                });
                inTable = true;
                continue;
            }

            if (!inTable && tableRows.length === 0) {
                // Header row
                tableRows.push(cells);
                continue;
            }

            tableRows.push(cells);

            // Check if next line is NOT a table row — flush
            const next = lines[li + 1];
            if (!next || !next.includes('|') || !next.trim().startsWith('|')) {
                output.push(...renderTable(tableRows, tableAligns, width));
                tableRows = [];
                tableAligns = [];
                inTable = false;
            }
            continue;
        }

        // Flush any pending table
        if (tableRows.length > 0) {
            output.push(...renderTable(tableRows, tableAligns, width));
            tableRows = [];
            tableAligns = [];
            inTable = false;
        }

        // Headers
        if (line.startsWith('#### ')) {
            output.push(c.h3(line.slice(5)));
            continue;
        }
        if (line.startsWith('### ')) {
            output.push(c.h3(line.slice(4)));
            continue;
        }
        if (line.startsWith('## ')) {
            output.push(c.h2(line.slice(3)));
            continue;
        }
        if (line.startsWith('# ')) {
            output.push(c.h1(line.slice(2)));
            continue;
        }

        // HR
        if (/^[-*_]{3,}\s*$/.test(line)) {
            output.push(c.hr('─'.repeat(Math.min(width - 4, 40))));
            continue;
        }

        // Blockquote
        if (line.startsWith('> ')) {
            output.push(c.quoteMark('  ▎ ') + c.quote(renderInline(line.slice(2))));
            continue;
        }

        // Checkbox lists
        if (/^\s*[-*]\s\[x\]/i.test(line)) {
            const content = line.replace(/^\s*[-*]\s\[x\]\s*/i, '');
            output.push('  ' + c.check('✓ ') + c.dim(renderInline(content)));
            continue;
        }
        if (/^\s*[-*]\s\[\s\]/.test(line)) {
            const content = line.replace(/^\s*[-*]\s\[\s\]\s*/, '');
            output.push('  ' + c.uncheck('○ ') + renderInline(content));
            continue;
        }

        // Bullet lists
        if (/^\s*[-*+]\s/.test(line)) {
            const indent = line.match(/^(\s*)/)?.[1] || '';
            const content = line.replace(/^\s*[-*+]\s/, '');
            output.push(indent + '  ' + c.bullet('• ') + renderInline(content));
            continue;
        }

        // Numbered lists
        if (/^\s*\d+\.\s/.test(line)) {
            const match = line.match(/^(\s*)(\d+)\.\s(.*)/);
            if (match) {
                output.push(match[1] + '  ' + c.number(match[2] + '. ') + renderInline(match[3]));
                continue;
            }
        }

        // Regular text
        output.push(renderInline(line));
    }

    // Flush remaining table
    if (tableRows.length > 0) {
        output.push(...renderTable(tableRows, tableAligns, width));
    }

    return output.join('\n');
}

function renderInline(text: string): string {
    return text
        .replace(/\*\*\*(.+?)\*\*\*/g, (_, s) => c.bold(chalk.italic(s)))
        .replace(/\*\*(.+?)\*\*/g, (_, s) => c.bold(s))
        .replace(/\*(.+?)\*/g, (_, s) => c.italic(s))
        .replace(/`([^`]+)`/g, (_, s) => c.code('`' + s + '`'))
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, txt, url) => c.link(txt) + ' ' + c.linkUrl(url))
        .replace(/~~(.+?)~~/g, (_, s) => chalk.strikethrough(s));
}

function renderTable(rows: string[][], aligns: string[], width: number): string[] {
    if (rows.length === 0) return [];

    const cols = Math.max(...rows.map((r) => r.length));
    // Calculate column widths
    const colWidths: number[] = [];
    for (let col = 0; col < cols; col++) {
        colWidths[col] = Math.max(...rows.map((r) => (r[col] || '').length), 3);
    }
    // Cap total width
    const totalW = colWidths.reduce((a, b) => a + b, 0) + cols * 3 + 1;
    if (totalW > width - 4) {
        const scale = (width - 4) / totalW;
        for (let i = 0; i < colWidths.length; i++) {
            colWidths[i] = Math.max(3, Math.floor(colWidths[i] * scale));
        }
    }

    const output: string[] = [];
    const sep = c.tableB('  ├' + colWidths.map((w) => '─'.repeat(w + 2)).join('┼') + '┤');
    const top = c.tableB('  ┌' + colWidths.map((w) => '─'.repeat(w + 2)).join('┬') + '┐');
    const bot = c.tableB('  └' + colWidths.map((w) => '─'.repeat(w + 2)).join('┴') + '┘');

    output.push(top);

    for (let ri = 0; ri < rows.length; ri++) {
        const row = rows[ri];
        const cells = colWidths.map((w, ci) => {
            const val = (row[ci] || '').slice(0, w);
            const pad = ' '.repeat(Math.max(0, w - val.length));
            const text = ri === 0 ? c.tableH(val) : renderInline(val);
            return ' ' + text + pad + ' ';
        });
        output.push(c.tableB('  │') + cells.join(c.tableB('│')) + c.tableB('│'));
        if (ri === 0 && rows.length > 1) output.push(sep);
    }

    output.push(bot);
    return output;
}
