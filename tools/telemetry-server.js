#!/usr/bin/env node
'use strict';

/*
 * Temporary diagnostic sink for js/perf.js. Not part of the product.
 *
 * The TV app posts batches of measurements here and each batch is appended to
 * tools/telemetry/telemetry.log, one JSON array per line. It lives on its own port because the
 * Arc Player server (the real phone, or the mock) owns 8080.
 *
 *   node tools/telemetry-server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 8099);
const LOG = path.join(__dirname, 'telemetry', 'telemetry.log');

fs.mkdirSync(path.dirname(LOG), { recursive: true });

const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
        res.writeHead(200, cors());
        res.end();
        return;
    }

    if (req.url !== '/api/telemetry') {
        res.writeHead(404, cors());
        res.end('not found');
        return;
    }

    let body = '';
    req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 400000) { req.destroy(); }
    });
    req.on('end', () => {
        if (body.trim()) {
            try { fs.appendFileSync(LOG, body.trim() + '\n'); } catch (ignored) { /* best effort */ }
            for (const line of body.trim().split('\n')) {
                let parsed;
                try { parsed = JSON.parse(line); } catch (ignored) { continue; }
                const rows = Array.isArray(parsed) ? parsed : [parsed];
                for (const row of rows) {
                    if (row.type === 'key') {
                        console.log(`key ${row.code}  handler ${row.handlerMs}ms  toFrame ${row.toFrame}ms  frame ${row.frame}ms  total ${row.total}ms`);
                    } else if (row.type === 'long') {
                        console.log(`long task ${row.ms}ms`);
                    } else if (row.type === 'env') {
                        console.log(`env ${row.w}x${row.h} dpr ${row.dpr} tizen ${row.tizen} avplay ${row.avplay}`);
                    }
                }
            }
        }
        res.writeHead(204, cors());
        res.end();
    });
});

function cors() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };
}

server.listen(PORT, '0.0.0.0', () => {
    console.log(`telemetry sink on http://0.0.0.0:${PORT}/api/telemetry -> ${LOG}`);
});

process.on('uncaughtException', (error) => {
    console.error('[telemetry] uncaught:', error && error.stack ? error.stack : error);
});
