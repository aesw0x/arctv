#!/usr/bin/env node
'use strict';

/*
 * ArcTV mock server.
 *
 * Answers the same routes as Arc Player's phone server — docs/PROTOCOL.md is the contract both sides
 * are written against — so the TV can be built and previewed in a browser with no phone on the network.
 * No dependencies, plain Node:
 *
 *   node server.js
 *
 * Then point the TV app (or a browser) at http://<this machine>:8080
 *
 * What is invented here: the twelve films, their ids and their codecs, which come from the file names
 * in FILMS below rather than from a Telegram shelf, and the artwork, which is drawn instead of cached.
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

/*
 * A shelf of films as the phone would report them, so a browser preview shows what the real server
 * sends rather than a subset of it. The names are release-folder names on purpose: `audioCodec` is read
 * out of the file name by both sides, and `id` is a string because a 64-bit Telegram id does not survive
 * a JavaScript number.
 */
const FILMS = [
    {
        id: '-3217499465312568008', fileName: 'Blade.Runner.2049.2017.2160p.HDR10.x265.DTS-HD.MA.5.1-ETHEL.mkv',
        title: 'Blade Runner 2049', year: 2017, genres: ['Sci-Fi', 'Drama', 'Mystery'],
        overview: 'A young blade runner unearths a long-buried secret that could plunge what is left of society into chaos, and leads him to Rick Deckard.'
    },
    {
        id: '-3217499465312568009', fileName: 'Arrival.2016.1080p.BluRay.x264.DTS.AC3-RARBG.mkv',
        title: 'Arrival', year: 2016, genres: ['Sci-Fi', 'Drama', 'Mystery'],
        overview: 'A linguist is recruited by the military to communicate with alien lifeforms after twelve mysterious spacecraft land around the world.'
    },
    {
        id: '-3217499465312568010', fileName: 'Dune.2021.2160p.WEB-DL.DDP5.9.6.Atmos.HDR10.x265.mkv',
        title: 'Dune', year: 2021, genres: ['Sci-Fi', 'Adventure', 'Drama'],
        overview: 'Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family.'
    },
    {
        id: '-3217499465312568011', fileName: 'Sicario.2015.1080p.BluRay.x264.AC3-RARBG.mkv',
        title: 'Sicario', year: 2015, genres: ['Crime', 'Thriller', 'Action'],
        overview: 'An idealistic FBI agent enlisted by a government task force aids the growing war against a cartel, and learns the rules have changed.'
    },
    {
        id: '-3217499465312568012', fileName: 'Prisoners.2013.1080p.BluRay.x264.TRUEHD.5.1-SPARKS.mkv',
        title: 'Prisoners', year: 2013, genres: ['Crime', 'Drama', 'Mystery'],
        overview: 'When his daughter goes missing, a desperate father takes matters into his own hands as police trace a second trail of suspects.'
    },
    {
        id: '-3217499465312568013', fileName: 'The.Grand.Budapest.Hotel.2014.1080p.BluRay.x264.AAC.5.1.mkv',
        title: 'The Grand Budapest Hotel', year: 2014, genres: ['Adventure', 'Comedy', 'Drama'],
        overview: 'A writer meets the owner of an aging grand hotel, who tells of his years as lobby boy and the theft of a Renaissance masterpiece.'
    },
    {
        id: '-3217499465312568014', fileName: 'Whiplash.2014.1080p.WEB-DL.AAC.2.0.H264.mkv',
        title: 'Whiplash', year: 2014, genres: ['Drama', 'Music'],
        overview: 'A promising young drummer enrolls at a conservatory where an instructor stops at nothing to realize a student potential.'
    },
    {
        id: '-3217499465312568015', fileName: 'Moonlight.2016.1080p.BluRay.x264.DD5.1-RARBG.mkv',
        title: 'Moonlight', year: 2016, genres: ['Drama'],
        overview: 'A quiet, self-possessed young man grapples with his identity and sexuality across three defining chapters of his life.'
    },
    {
        id: '-3217499465312568016', fileName: 'No.Country.for.Old.Men.2007.1080p.BluRay.x264.mkv',
        title: 'No Country for Old Men', year: 2007, genres: ['Crime', 'Drama', 'Thriller'],
        overview: 'Violence and mayhem ensue after a hunter stumbles on a cache of money and a dead man phone at a desert deal gone wrong.'
    },
    {
        id: '-3217499465312568017', fileName: 'There.Will.Be.Blood.2007.1080p.BluRay.x264.FLAC.2.0.mkv',
        title: 'There Will Be Blood', year: 2007, genres: ['Drama'],
        overview: 'A silver prospector turned oilman in the 1890s binds his life to that of a boy and to the faith that would save him from himself.'
    },
    {
        id: '-3217499465312568018', fileName: 'Children.of.Men.2006.1080p.BluRay.x264.eAC3.5.1.mkv',
        title: 'Children of Men', year: 2006, genres: ['Drama', 'Sci-Fi', 'Thriller'],
        overview: 'Twenty years into a global infertility crisis, a tired official must protect the first pregnant woman in eighteen years.'
    },
    {
        id: '-3217499465312568019', fileName: 'Heat.1995.1080p.BluRay.x264.AC3-REWARD.mkv',
        title: 'Heat', year: 1995, genres: ['Crime', 'Drama', 'Thriller'],
        overview: 'A group of professional robbers and the detective hunting them find their lives becoming dangerously entwined.'
    }
];

// One film starts half-watched, so the hero shows a progress bar before anything has been played.
// It lives in the same map a POST writes, so /api/progress and /api/library never disagree.
resumePositions.set(FILMS[1].id, 42000);

/**
 * The codec a copy claims, and whether this TV can decode it.
 *
 * Mirrors the phone's own filename reading, order matters as much as the patterns: the DTS family is
 * refused, anything Dolby or PCM-ish plays, and a dual-audio rip (the usual "...DTS.AC3...") must not
 * warn, because the TV will simply pick the track it can hear. A name that says nothing about its audio
 * answers null, which the app renders as no badge at all.
 */
// Mirrored from AudioTag.kt on the phone, pattern for pattern. The mock is the design's stand-in, so a
// chip that appears here and not there is worse than no chip at all.
const AUDIO_TAGS = [
    { codec: 'truehd', decodable: false, pattern: /(?<![0-9a-z])(?:true[ ._-]?hd|dtt?hd|thd)(?![0-9a-z])/i },
    { codec: 'dts-hd', decodable: false, pattern: /(?<![0-9a-z])dts[ ._-]?(?:hd|ma|hr)(?![0-9a-z])/i },
    { codec: 'dts', decodable: false, pattern: /(?<![0-9a-z])dts(?![0-9a-z])/i },
    { codec: 'eac3', decodable: true, pattern: /(?<![0-9a-z])(?:eac[ ._-]?3|ddp\d*|dd[ ._-]?(?:plus|\+)|dolby[ ._-]?digital[ ._-]?plus)(?![0-9a-z])/i },
    { codec: 'ac3', decodable: true, pattern: /(?<![0-9a-z])(?:ac[ ._-]?3|dd|dd5[ ._-]?1|dolby[ ._-]?digital)(?![0-9a-z])/i },
    { codec: 'flac', decodable: true, pattern: /(?<![0-9a-z])flac(?![0-9a-z])/i },
    { codec: 'opus', decodable: true, pattern: /(?<![0-9a-z])opus(?![0-9a-z])/i },
    { codec: 'aac', decodable: true, pattern: /(?<![0-9a-z])aac(?:[ ._-]?[0-9][ ._-]?[01])?(?![0-9a-z])/i },
    { codec: 'mp3', decodable: true, pattern: /(?<![0-9a-z])(?:mp3|mp2)(?![0-9a-z])/i }
];

function audioClaim(fileName) {
    const body = fileName
        .replace(/\.[A-Za-z0-9]{1,5}$/i, ' ')
        .replace(/@[A-Za-z0-9_]{2,32}/g, ' ')
        .toLowerCase();
    const matched = AUDIO_TAGS.filter((tag) => tag.pattern.test(body));
    const playable = matched.find((tag) => tag.decodable);
    if (playable) return { codec: playable.codec, unsupported: false };
    return matched.length ? { codec: matched[0].codec, unsupported: true } : { codec: null, unsupported: false };
}

/**
 * The phone's own resume rule, copied in behaviour rather than in code.
 *
 * The last stretch of a film is an ending, not a place to come back to, so a position that deep stores
 * nothing; a too-short watch and a too-short film are not worth a bookmark either. Without this the mock
 * would keep a "Resume at 1:58" that the real phone silently drops, and the two would never agree.
 */
const MIN_TRACKABLE_DURATION_MS = 30 * 1000;
const MIN_RESUME_POSITION_MS = 3 * 1000;
const TAIL_PERCENT = 8;
const MAX_TAIL_MS = 90 * 1000;
const END_SLACK_MS = 4 * 1000;

function tailMs(durationMs) {
    return Math.min(Math.floor(durationMs * TAIL_PERCENT / 100), MAX_TAIL_MS);
}

function decideResume(positionMs, durationMs) {
    if (durationMs <= 0 || positionMs < 0) { return 'keep'; }
    if (durationMs < MIN_TRACKABLE_DURATION_MS) { return 'drop'; }
    if (positionMs >= durationMs - END_SLACK_MS) { return 'drop'; }
    if (positionMs >= durationMs - tailMs(durationMs)) { return 'drop'; }
    if (positionMs < MIN_RESUME_POSITION_MS) { return 'keep'; }
    return 'store';
}

function library() {
    const size = MEDIA ? MEDIA.size : 0;
    return FILMS.map((film) => {
        const audio = audioClaim(film.fileName);
        return {
            id: film.id,
            fileName: film.fileName,
            title: film.title,
            subtitle: null,
            year: film.year,
            overview: film.overview,
            genres: film.genres,
            sizeBytes: size,
            durationMs: 120000,
            width: 1920,
            height: 1080,
            mimeType: 'video/mp4',
            posterUrl: `/artwork/${film.id}/poster?k=${TOKEN}`,
            backdropUrl: `/artwork/${film.id}/backdrop?k=${TOKEN}`,
            resumeMs: resumePositions.get(film.id) || 0,
            audioCodec: audio.codec,
            needsRemux: audio.unsupported,
            bitrateMbps: size > 0 ? Number(((size * 8) / 120000 / 1000).toFixed(2)) : 0
        };
    });
}

/**
 * Stand-in artwork for the mock phone, in both shapes the real one serves.
 *
 * Real Telegram posters are photographs, so this draws something photographic-ish rather than a
 * flat swatch with the title in the middle: a coloured sky, two out-of-focus light shapes, a
 * vignette, and the title set small at the foot the way a film poster would. The middle of the
 * frame stays clean because the TV crops exactly that band for the hero backdrop.
 */
function artworkSvg(id, title, kind) {
    // The ids are 64-bit strings, so the seed is a stable hash of the digits rather than the number:
    // read as a float a Telegram id loses its low bits, and neighbouring films collapse onto one hue.
    let seed = 0;
    for (const ch of String(id)) { seed = (seed * 31 + ch.charCodeAt(0)) % 100000; }
    // Golden-angle spread so neighbouring ids do not come out as the same orange.
    const hue = Math.round((seed * 137.508) % 360);
    const hue2 = (hue + 30 + (seed % 50)) % 360;
    const glowHue = (hue + 55) % 360;
    const accentHue = (hue + 190) % 360;

    const wide = kind === 'backdrop';
    const width = wide ? 1280 : 400;
    const height = wide ? 720 : 600;
    const fontSize = wide ? 44 : 26;
    const lineHeight = wide ? 52 : 30;
    const margin = wide ? 64 : 32;

    const escaped = title.replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
    }[c]));

    const words = escaped.split(' ');
    const longest = wide ? 30 : 18;
    const lines = [];
    let current = '';
    for (const word of words) {
        if ((current + ' ' + word).trim().length > longest) { lines.push(current.trim()); current = word; }
        else { current = (current + ' ' + word).trim(); }
    }
    if (current) lines.push(current);

    const baseY = height - (wide ? 64 : 44) - (lines.length - 1) * lineHeight;
    const text = lines.map((line, i) =>
        `<text x="${margin}" y="${baseY + i * lineHeight}" font-family="Segoe UI, sans-serif" font-size="${fontSize}" font-weight="600" fill="#ffffff" opacity="0.94">${line}</text>`
    ).join('');

    const near = {
        cx: Math.round(width * (0.23 + ((seed * 7) % 20) / 100)),
        cy: Math.round(height * (0.39 + ((seed * 11) % 16) / 100)),
        r: Math.round(width * (0.21 + (seed % 12) / 100))
    };
    const far = {
        cx: Math.round(width * (0.8 - ((seed * 3) % 18) / 100)),
        cy: Math.round(height * (0.25 + ((seed * 13) % 12) / 100)),
        r: Math.round(width * (0.13 + (seed % 9) / 100))
    };

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
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
  <rect width="${width}" height="${height}" fill="url(#sky)"/>
  <rect width="${width}" height="${height}" fill="url(#glow)"/>
  <circle cx="${near.cx}" cy="${near.cy}" r="${near.r}"
          fill="hsl(${accentHue}, 62%, 56%)" opacity="0.16"/>
  <circle cx="${far.cx}" cy="${far.cy}" r="${far.r}"
          fill="hsl(${(hue + 120) % 360}, 68%, 66%)" opacity="0.14"/>
  <rect x="0" y="${Math.round(height * (0.53 + ((seed * 17) % 10) / 100))}" width="${width}" height="2" fill="#ffffff" opacity="0.07"/>
  <rect width="${width}" height="${height}" fill="url(#foot)"/>
  ${text}
</svg>`;
}

/*
 * Which films have a caption sitting in the phone's cache.
 *
 * The real server answers 404 for a film it never cached a subtitle for — it will not wake Telegram to
 * fetch one while a stream is running — so the mock must fail the same way, or the TV gets built against
 * a promise the phone does not keep.
 */
const CAPTIONED = new Set(['-3217499465312568008', '-3217499465312568009', '-3217499465312568010']);

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
        send(res, 200, `ArcTV mock server\n\nmedia: ${MEDIA ? MEDIA.name + ' (' + MEDIA.size + ' bytes)' : 'MISSING — run make-media.ps1'}\ntoken: ${TOKEN}\n\n/api/ping\n/api/library?k=${TOKEN}\n/artwork/ID/poster?k=${TOKEN}\n/api/progress?k=${TOKEN}\n/api/subtitles/ID?k=${TOKEN}\n/stream/ID?k=${TOKEN}\n`, 'text/plain; charset=utf-8');
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

    if (url.pathname.startsWith('/artwork/')) {
        if (!authorized(url, req)) { send(res, 401, ''); return; }
        const parts = url.pathname.slice('/artwork/'.length).split('/');
        if (parts.length !== 2) { send(res, 404, ''); return; }
        const item = library().find((entry) => entry.id === parts[0]);
        if (!item || (parts[1] !== 'poster' && parts[1] !== 'backdrop')) { send(res, 404, ''); return; }
        send(res, 200, artworkSvg(item.id, item.title, parts[1]), 'image/svg+xml');
        return;
    }

    if (url.pathname.startsWith('/api/subtitles/')) {
        if (!authorized(url, req)) { send(res, 401, ''); return; }
        const id = url.pathname.slice('/api/subtitles/'.length);
        // The phone answers 404 rather than fetching a caption from Telegram, and a film with no cached
        // subtitle must fail the same way here or the TV is built against an answer that never comes.
        if (!CAPTIONED.has(id)) { send(res, 404, ''); return; }
        if (req.method === 'HEAD') { send(res, 200, '', 'text/plain; charset=utf-8'); return; }
        send(res, 200, SUBTITLES, 'text/plain; charset=utf-8');
        return;
    }

    if (url.pathname === '/api/progress') {
        if (!authorized(url, req)) { send(res, 401, ''); return; }
        if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => { body += chunk; if (body.length > 4096) req.destroy(); });
            req.on('end', () => {
                let parsed = null;
                try { parsed = JSON.parse(body); } catch (ignored) { /* falls through to 400 */ }
                if (!parsed || typeof parsed !== 'object') { send(res, 400, 'expected a JSON object'); return; }
                const id = String(parsed.id);
                const positionMs = Number(parsed.positionMs);
                if (!Number.isFinite(positionMs)) { send(res, 400, 'expected a position'); return; }
                const item = library().find((entry) => entry.id === id);
                if (!item) { send(res, 404, ''); return; }
                // The phone prefers its own length for the film and falls back to the one the TV measured.
                const durationMs = item.durationMs > 0 ? item.durationMs : Number(parsed.durationMs) || 0;
                const verdict = decideResume(positionMs, durationMs);
                if (verdict === 'store') { resumePositions.set(id, positionMs); }
                if (verdict === 'drop') { resumePositions.delete(id); }
                console.log(`progress: ${id} -> ${positionMs} ms (${durationMs} ms film) ${verdict}`);
                send(res, 204, '');
            });
            return;
        }
        const positions = {};
        for (const [id, positionMs] of resumePositions) { positions[id] = positionMs; }
        json(res, 200, { positions });
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
