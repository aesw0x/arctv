/*
 * A throwaway static file server for the TV client, so it can be loaded over http:// instead of
 * file:// (fetch from a file:// origin is blocked, and that is the only reason this exists).
 *
 *   node tools/static.js [port] [root]
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.argv[2] || 8081);
const ROOT = path.resolve(process.argv[3] || path.join(__dirname, '..', 'tizen'));

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2'
};

http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';

    const full = path.join(ROOT, rel);
    if (!full.startsWith(ROOT)) {
        res.writeHead(403).end('forbidden');
        return;
    }

    fs.readFile(full, (error, data) => {
        if (error) {
            res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
            return;
        }
        res.writeHead(200, {
            'Content-Type': TYPES[path.extname(full).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-store',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(data);
    });
}).listen(PORT, '0.0.0.0', () => {
    console.log(`ArcTV dev server  http://localhost:${PORT}/  ->  ${ROOT}`);
});
