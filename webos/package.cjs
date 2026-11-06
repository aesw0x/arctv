/*
 * The webOS build.
 *
 * This is not a second copy of the app. `tizen/` holds the only sources — the same HTML, the same
 * CSS, the same ES5 modules that run on the Samsung panel — and this assembles them beside a webOS
 * manifest in a scratch directory and hands that to `ares-package`. The app stays edited in one
 * place, and its version comes from `tizen/config.xml`, so the two packages can never drift apart.
 *
 *   node webos/package.cjs              writes webos/Debug/<id>_<version>.ipk
 *   node webos/package.cjs --no-package only refreshes webos/.build, for the LG IDE's import
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const appDir = path.resolve(__dirname, '..', 'tizen');
const buildDir = path.join(__dirname, '.build');
const outDir = path.join(__dirname, 'Debug');

function version() {
    const xml = fs.readFileSync(path.join(appDir, 'config.xml'), 'utf8');
    /* The widget tag, not just any version= in the file: the XML declaration carries one too. */
    const widget = /<widget\b[^>]*>/i.exec(xml);
    const found = widget && /(?:^|\s)version="([^"]+)"/.exec(widget[0]);
    if (!found) { throw new Error('tizen/config.xml carries no version to build from'); }
    return found[1];
}

fs.rmSync(buildDir, { recursive: true, force: true });
fs.mkdirSync(buildDir, { recursive: true });

for (const entry of ['index.html', 'css', 'js', 'icon.png']) {
    fs.cpSync(path.join(appDir, entry), path.join(buildDir, entry), { recursive: true });
}

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'appinfo.json'), 'utf8'));
manifest.version = version();
fs.writeFileSync(path.join(buildDir, 'appinfo.json'), JSON.stringify(manifest, null, 2) + '\n');

const shipped = fs.readdirSync(path.join(buildDir, 'js')).sort();
console.log('app ' + manifest.id + ' ' + manifest.version);
console.log('from tizen/  ' + shipped.length + ' scripts, css, index.html, icon.png');

if (process.argv.indexOf('--no-package') >= 0) {
    console.log('staged in ' + buildDir);
    return;
}

const command = process.platform === 'win32' ? 'ares-package.cmd' : 'ares-package';
const quoted = ['"' + command + '"', '"' + buildDir + '"', '-o', '"' + outDir + '"'].join(' ');
const result = spawnSync(quoted, { shell: true, stdio: 'inherit' });

if (result.status !== 0) {
    console.error('ares-package failed (' + (result.error ? result.error.message : 'exit ' + result.status) + ')');
    console.error('is ares-cli installed?  npm install -g ares-cli');
    process.exit(result.status || 1);
}

for (const ipk of fs.readdirSync(outDir).filter((name) => name.endsWith('.ipk'))) {
    const file = path.join(outDir, ipk);
    console.log('wrote ' + file + ' (' + Math.round(fs.statSync(file).size / 1024) + ' KB)');
}
