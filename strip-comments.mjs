import fs from 'fs';

// Strips // and /* */ comments from JS while respecting strings and
// (nested) template literals. Whole-line comments take their line with them.
function stripJs(src) {
    let out = '';
    let i = 0;
    const n = src.length;
    const modes = ['code'];
    let exprBrace = 0;

    const currentLine = () => out.slice(out.lastIndexOf('\n') + 1);
    const dropCurrentLine = () => { out = out.slice(0, out.lastIndexOf('\n') + 1); };
    const rstripLine = () => { out = out.replace(/[ \t]+$/, ''); };
    const consumeNewline = (j) => {
        if (src[j] === '\r' && src[j + 1] === '\n') return j + 2;
        if (src[j] === '\n') return j + 1;
        return j;
    };

    const copyString = (quote) => {
        let j = i + 1;
        while (j < n) {
            if (src[j] === '\\') { j += 2; continue; }
            if (src[j] === quote) { j++; break; }
            j++;
        }
        out += src.slice(i, j);
        return j;
    };

    while (i < n) {
        const mode = modes[modes.length - 1];
        const c = src[i];
        const d = src[i + 1];

        if (mode === 'tpl') {
            if (c === '\\') { out += src.slice(i, i + 2); i += 2; continue; }
            if (c === '`') { modes.pop(); out += c; i++; continue; }
            if (c === '$' && d === '{') { modes.push('expr'); exprBrace = 0; out += src.slice(i, i + 2); i += 2; continue; }
            out += c; i++;
            continue;
        }

        if (mode === 'expr' && (c === '{' || c === '}')) {
            if (c === '{') { exprBrace++; out += c; i++; continue; }
            if (exprBrace === 0) { modes.pop(); out += c; i++; continue; }
            exprBrace--; out += c; i++;
            continue;
        }

        if (c === '/' && d === '/') {
            let j = i;
            while (j < n && src[j] !== '\n') j++;
            if (currentLine().trim() === '') {
                dropCurrentLine();
                j = consumeNewline(j);
            } else {
                rstripLine();
            }
            i = j;
            continue;
        }

        if (c === '/' && d === '*') {
            let j = i + 2;
            while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j++;
            j = Math.min(j + 2, n);
            if (currentLine().trim() === '') {
                dropCurrentLine();
                j = consumeNewline(j);
            } else {
                rstripLine();
            }
            i = j;
            continue;
        }

        if (c === "'" || c === '"') { i = copyString(c); continue; }
        if (c === '`') { modes.push('tpl'); out += c; i++; continue; }

        out += c; i++;
    }
    return out;
}

function stripCss(src) {
    let out = src.replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*\r?\n/gm, '');
    out = out.replace(/\/\*[\s\S]*?\*\//g, '');
    return out.split('\n').map(l => l.replace(/[ \t]+$/, '')).join('\n');
}

const jsFiles = process.argv.slice(2).filter(f => f.endsWith('.js'));
const cssFiles = process.argv.slice(2).filter(f => f.endsWith('.css'));

for (const f of jsFiles) {
    const before = fs.readFileSync(f, 'utf8');
    const after = stripJs(before);
    if (after !== before) {
        fs.writeFileSync(f, after);
        console.log(`stripped ${f}`);
    }
}
for (const f of cssFiles) {
    const before = fs.readFileSync(f, 'utf8');
    const after = stripCss(before);
    if (after !== before) {
        fs.writeFileSync(f, after);
        console.log(`stripped ${f}`);
    }
}
