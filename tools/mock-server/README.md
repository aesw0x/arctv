# Mock server

A fake phone. Implements [`../../docs/PROTOCOL.md`](../../docs/PROTOCOL.md) so the TV app can be
built and tested before the real Android server exists.

No dependencies — plain Node.

## Run

```powershell
powershell -ExecutionPolicy Bypass -File .\make-media.ps1   # once
node server.js
```

- `http://localhost:8080` — a summary page with the token
- Token: random per start, printed on the console and on the summary page (pin it with `TOKEN=…`)
- Port: `8080` (override with `PORT=…`)

## Media

`make-media.ps1` renders 120 s of 1080p test pattern at ~3 Mbps with a tone (45 MB), using
ffmpeg. If you would rather use a real film, drop any file into `media/` — the server picks
the first video it finds.

Everything in the library points at that one file, so seeking and throughput behave exactly
as they will against the real thing.

## What it implements

| Endpoint | Notes |
|---|---|
| `GET /api/ping` | unauthenticated, CORS |
| `POST /api/pair/request` | returns a 6-char code |
| `GET /pair?c=CODE` | **browser page** that approves the pairing |
| `GET /api/pair/status?c=CODE` | polled by the TV |
| `GET /api/library` | 14 works over 25 files — two copies of Dune, a two-season show with two copies of S05E01, a one-season miniseries |
| `GET /artwork/{id}/poster` | generated SVG artwork |
| `GET /api/subtitles/{id}` | 4-cue SRT |
| `GET /api/progress` | GET and POST |
| `HEAD /stream/{id}` | full size advertised |
| `GET /stream/{id}` | real Range support, 206 / 416 |

## Simulating pairing

The TV shows a QR containing a code. Since there is no phone camera in the loop, "scanning"
means opening the URL the server logs:

```
pairing requested -> code 7F2K9Q  (open http://localhost:8080/pair?c=7F2K9Q)
```

Press **Allow**, and the TV's next poll returns `approved` with the token.

## Deliberately missing

- No growing-file behaviour — the media file is complete, so a stall never happens. The real
  server's blocking reads are the interesting part and cannot be exercised here.
- No DTS remux, no real artwork, no Telegram.

Those gaps are the point: the mock proves the TV app, not the phone.
