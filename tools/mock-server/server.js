#!/usr/bin/env node
'use strict';

/*
 * ArcTV mock server.
 *
 * Implements the same wire protocol as docs/PROTOCOL.md so the TV app can be built and tested
 * before the real phone server exists. No dependencies — plain Node.
 *
 *   node server.js
 *
 * Then point the TV app (or a browser) at http://<this machine>:8080
 *
 * The pairing flow is simulated: the TV shows a QR containing a code, and you "scan" it by
 * opening http://localhost:8080/pair?c=CODE in a browser and pressing Allow.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8080);
// Printed on start-up and on the summary page. Set TOKEN to keep one across runs.
const TOKEN = process.env.TOKEN || crypto.randomBytes(9).toString('hex');
const MEDIA_DIR = path.join(__dirname, 'media');
const PAIR_TTL_MS = 120 * 1000;

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.ts', '.webm', '.m4v'];

/** code -> { state, createdAt, token } */
const pairings = new Map();
const resumePositions = new Map();

function findMedia() {
    if (!fs.existsSync(MEDIA_DIR)) return null;
    for (const name of fs.readdirSync(MEDIA_DIR)) {
        if (VIDEO_EXTENSIONS.includes(path.extname(name).toLowerCase())) {
            const full = path.join(MEDIA_DIR, name);
            const stat = fs.statSync(full);
            if (stat.isFile() && stat.size > 0) return { path: full, size: stat.size, name };
        }
    }
    return null;
}

const MEDIA = findMedia();

const TITLES = [
    'Blade Runner 2049', 'Arrival', 'Dune', 'Sicario', 'Prisoners',
    'The Grand Budapest Hotel', 'Whiplash', 'Moonlight', 'No Country for Old Men',
    'There Will Be Blood', 'Children of Men', 'Heat'
];

function library() {
    const size = MEDIA ? MEDIA.size : 0;
    return TITLES.map((title, index) => {
        const id = -1001234567890 - index;
        return {
            id,
            title,
            chatTitle: 'Movies',
            sizeBytes: size,
            durationMs: 120000,
            width: 1920,
            height: 1080,
            mimeType: 'video/mp4',
            posterUrl: `/api/poster/${id}?k=${TOKEN}`,
            needsRemux: index === 3,
            audioCodec: index === 3 ? 'dts' : 'aac',
            resumeMs: resumePositions.get(id) || (index === 1 ? 42000 : 0),
            bitrateMbps: size > 0 ? Number(((size * 8) / 120000 / 1000).toFixed(2)) : 0
        };
    });
}

/**
 * Stand-in artwork for the mock phone.
 *
 * Real Telegram posters are photographs, so this draws something photographic-ish rather than a
 * flat swatch with the title in the middle: a coloured sky, two out-of-focus light shapes, a
 * vignette, and the title set small at the foot the way a film poster would. The middle of the
 * frame stays clean because the TV crops exactly that band for the hero backdrop.
 */
function posterSvg(id, title) {
    const seed = Math.abs(id);
    // Golden-angle spread so neighbouring ids do not come out as the same orange.
    const hue = Math.round((seed * 137.508) % 360);
    const hue2 = (hue + 30 + (seed % 50)) % 360;
    const glowHue = (hue + 55) % 360;
    const accentHue = (hue + 190) % 360;

    const escaped = title.replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
    }[c]));

    const words = escaped.split(' ');
    const lines = [];
    let current = '';
    for (const word of words) {
        if ((current + ' ' + word).trim().length > 18) { lines.push(current.trim()); current = word; }
        else { current = (current + ' ' + word).trim(); }
    }
    if (current) lines.push(current);

    const baseY = 556 - (lines.length - 1) * 30;
    const text = lines.map((line, i) =>
        `<text x="32" y="${baseY + i * 30}" font-family="Segoe UI, sans-serif" font-size="26" font-weight="600" fill="#ffffff" opacity="0.94">${line}</text>`
    ).join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0%" stop-color="hsl(${hue}, 58%, 38%)"/>
      <stop offset="52%" stop-color="hsl(${hue2}, 48%, 17%)"/>
      <stop offset="100%" stop-color="hsl(${hue2}, 44%, 7%)"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.72" cy="0.22" r="0.62">
      <stop offset="0%" stop-color="hsl(${glowHue}, 88%, 66%)" stop-opacity="0.8"/>
      <stop offset="60%" stop-color="hsl(${glowHue}, 88%, 66%)" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="hsl(${glowHue}, 88%, 66%)" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="foot" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.85"/>
    </linearGradient>
  </defs>
  <rect width="400" height="600" fill="url(#sky)"/>
  <rect width="400" height="600" fill="url(#glow)"/>
  <circle cx="${92 + (seed * 7) % 80}" cy="${236 + (seed * 11) % 100}" r="${86 + (seed * 5) % 64}"
          fill="hsl(${accentHue}, 62%, 56%)" opacity="0.16"/>
  <circle cx="${318 - (seed * 3) % 70}" cy="${150 + (seed * 13) % 70}" r="${54 + (seed * 9) % 46}"
          fill="hsl(${(hue + 120) % 360}, 68%, 66%)" opacity="0.14"/>
  <rect x="0" y="${320 + (seed * 17) % 40}" width="400" height="2" fill="#ffffff" opacity="0.07"/>
  <rect width="400" height="600" fill="url(#foot)"/>
  ${text}
</svg>`;
}

const SUBTITLES = `1
00:00:02,000 --> 00:00:06,000
Mock subtitle — this proves the TV can fetch external tracks.

2
00:00:08,000 --> 00:00:12,000
If you can read this, setExternalSubtitlePath worked.

3
00:00:20,000 --> 00:00:25,000
Seek to 60 seconds and this line should appear at 1:00.

4
00:01:00,000 --> 00:01:05,000
Sixty seconds in — the seek landed correctly.
`;

function parseRange(header, size) {
    if (!header) return { start: 0, end: size, partial: false };
    const text = String(header).trim();
    if (!/^bytes=/i.test(text)) return null;
    const spec = text.slice(6).trim();
    if (!spec || spec.includes(',')) return null;

    const dash = spec.indexOf('-');
    if (dash < 0) return null;

    const startText = spec.slice(0, dash).trim();
    const endText = spec.slice(dash + 1).trim();

    if (size <= 0) return null;

    if (startText === '') {
        const count = Number(endText);
        if (!Number.isFinite(count) || count <= 0) return null;
        return { start: Math.max(0, size - count), end: size, partial: true };
    }

    const start = Number(startText);
    if (!Number.isFinite(start) || start < 0 || start >= size) return null;

    const endInclusive = endText === '' ? size - 1 : Number(endText);
    if (!Number.isFinite(endInclusive) || endInclusive < start) return null;

    return { start, end: Math.min(endInclusive, size - 1) + 1, partial: true };
}

function send(res, status, body, type) {
    const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    res.writeHead(status, {
        'Content-Type': type || 'text/plain; charset=utf-8',
        'Content-Length': payload.length,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, X-Arc-Token, Content-Type',
        'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges'
    });
    res.end(payload);
}

function json(res, status, value) {
    send(res, status, JSON.stringify(value), 'application/json; charset=utf-8');
}

function authorized(url, req) {
    const key = url.searchParams.get('k') || req.headers['x-arc-token'];
    return key === TOKEN;
}

function sweepPairings() {
    const now = Date.now();
    for (const [code, entry] of pairings) {
        if (now - entry.createdAt > PAIR_TTL_MS && entry.state === 'pending') {
            entry.state = 'expired';
        }
    }
}

function handlePairPage(req, res, url) {
    const code = (url.searchParams.get('c') || '').toUpperCase();
    const entry = pairings.get(code);
    const state = !entry ? 'unknown' : entry.state;

    const body = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ArcTV pairing</title>
<style>body{background:#111;color:#eee;font-family:Segoe UI,sans-serif;display:flex;align-items:center;
justify-content:center;height:100vh;margin:0;flex-direction:column;gap:24px}
code{font-size:44px;letter-spacing:8px}button{font-size:22px;padding:14px 40px;border-radius:10px;
border:0;background:#2f6f4f;color:#fff;cursor:pointer}a{color:#888}</style></head><body>
<h1>ArcTV mock pairing</h1>
<p>Code <code>${code || '—'}</code></p>
<p>State: <strong>${state}</strong></p>
${state === 'pending'
            ? `<form method="POST" action="/api/pair/approve?c=${encodeURIComponent(code)}">
                 <button type="submit">Allow this TV</button></form>`
            : '<p><a href="/">back</a></p>'}
</body></html>`;

    send(res, 200, body, 'text/html; charset=utf-8');
}

function handleStream(req, res) {
    if (!MEDIA) {
        send(res, 503, 'No media. Run make-media.ps1, or drop a video into tools/mock-server/media/');
        return;
    }

    const range = parseRange(req.headers.range, MEDIA.size);
    if (range === null) {
        res.writeHead(416, {
            'Content-Range': `bytes */${MEDIA.size}`,
            'Access-Control-Allow-Origin': '*'
        });
        res.end();
        return;
    }

    const length = range.end - range.start;
    const headers = {
        'Content-Type': 'video/mp4',
        'Content-Length': length,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges'
    };
    if (range.partial) {
        headers['Content-Range'] = `bytes ${range.start}-${range.end - 1}/${MEDIA.size}`;
    }

    res.writeHead(range.partial ? 206 : 200, headers);
    if (req.method === 'HEAD') { res.end(); return; }

    fs.createReadStream(MEDIA.path, { start: range.start, end: range.end - 1 })
        .on('error', () => res.destroy())
        .pipe(res);
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'OPTIONS') { send(res, 200, ''); return; }

    if (url.pathname === '/') {
        send(res, 200, `ArcTV mock server\n\nmedia: ${MEDIA ? MEDIA.name + ' (' + MEDIA.size + ' bytes)' : 'MISSING — run make-media.ps1'}\ntoken: ${TOKEN}\n\n/api/ping\n/api/library?k=${TOKEN}\n/stream/ID?k=${TOKEN}\n`, 'text/plain; charset=utf-8');
        return;
    }

    if (url.pathname === '/api/ping') {
        json(res, 200, { service: 'arcplayer', version: 1, device: 'Mock Phone', pairing: 'open' });
        return;
    }

    if (url.pathname === '/pair') { handlePairPage(req, res, url); return; }

    if (url.pathname === '/api/pair/request' && req.method === 'POST') {
        sweepPairings();
        const code = Math.random().toString(36).slice(2, 8).toUpperCase();
        pairings.set(code, { state: 'pending', createdAt: Date.now(), token: null });
        console.log(`pairing requested -> code ${code}  (open http://localhost:${PORT}/pair?c=${code})`);
        json(res, 200, { code, expiresAt: Date.now() + PAIR_TTL_MS });
        return;
    }

    if (url.pathname === '/api/pair/approve' && req.method === 'POST') {
        const code = (url.searchParams.get('c') || '').toUpperCase();
        const entry = pairings.get(code);
        if (!entry) { json(res, 404, { state: 'unknown' }); return; }
        entry.state = 'approved';
        entry.token = TOKEN;
        console.log(`pairing ${code} approved`);
        send(res, 200, 'Approved. You can close this tab.');
        return;
    }

    if (url.pathname === '/api/pair/status') {
        const code = (url.searchParams.get('c') || '').toUpperCase();
        const entry = pairings.get(code);
        if (!entry) { json(res, 200, { state: 'unknown' }); return; }
        if (entry.state === 'approved') {
            json(res, 200, { state: 'approved', token: entry.token, device: 'TV' });
        } else {
            json(res, 200, { state: entry.state });
        }
        return;
    }

    if (url.pathname === '/api/library') {
        if (!authorized(url, req)) { send(res, 401, ''); return; }
        json(res, 200, { version: 1, generatedAt: Date.now(), items: library() });
        return;
    }

    if (url.pathname.startsWith('/api/poster/')) {
        if (!authorized(url, req)) { send(res, 401, ''); return; }
        const id = Number(url.pathname.slice('/api/poster/'.length));
        const item = library().find((entry) => entry.id === id);
        if (!item) { send(res, 404, ''); return; }
        send(res, 200, posterSvg(id, item.title), 'image/svg+xml');
        return;
    }

    if (url.pathname.startsWith('/api/subtitles/')) {
        if (!authorized(url, req)) { send(res, 401, ''); return; }
        send(res, 200, SUBTITLES, 'text/plain; charset=utf-8');
        return;
    }

    if (url.pathname === '/api/progress') {
        if (!authorized(url, req)) { send(res, 401, ''); return; }
        if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => { body += chunk; if (body.length > 4096) req.destroy(); });
            req.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    resumePositions.set(parsed.id, parsed.positionMs);
                    console.log(`progress: ${parsed.id} -> ${parsed.positionMs} ms`);
                } catch (ignored) { /* ignore */ }
                send(res, 204, '');
            });
            return;
        }
        json(res, 200, { positions: {} });
        return;
    }

    if (url.pathname.startsWith('/stream/')) {
        if (!authorized(url, req)) { send(res, 401, ''); return; }
        handleStream(req, res);
        return;
    }

    send(res, 404, 'not found');
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`ArcTV mock server on http://0.0.0.0:${PORT}`);
    console.log(`token: ${TOKEN}`);
    if (MEDIA) {
        console.log(`media: ${MEDIA.name} (${MEDIA.size} bytes)`);
    } else {
        console.log('media: MISSING — run make-media.ps1, or drop a video into ./media/');
    }
});

// A TV hangs up mid-seek constantly; that surfaces as a socket error, and an unhandled one takes
// the whole process down. During a demo the server has to outlive its clients.
server.on('clientError', (error, socket) => {
    try { socket.destroy(); } catch (ignored) { /* already gone */ }
});

process.on('uncaughtException', (error) => {
    console.error('[mock] uncaught:', error && error.stack ? error.stack : error);
});

process.on('unhandledRejection', (reason) => {
    console.error('[mock] rejected:', reason);
});
