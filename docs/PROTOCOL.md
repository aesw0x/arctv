# ArcTV Wire Protocol

Contract between **Arc Player** (phone, server) and the **ArcTV** Tizen app (TV, client).

Version `2` — bump on breaking change; both sides reject unknown majors. Version 2 changed the shape of
`/api/library` from files to works, with no compatibility field left behind.

---

## 1. Transport

| Property | Value |
|---|---|
| Base URL | `http://<phone-ip>:8080` |
| Bind address | `0.0.0.0` — **LAN only**, never internet-exposed |
| Auth | Bearer token, 32 chars, issued at pairing |
| Token transport | **Query parameter `k`** on every request |

### Why the token is a query parameter

AVPlay's `open(url)` accepts **no custom headers**. The only way to authenticate the media
request is in the URL:

```
http://192.168.0.42:8080/stream/123?k=9f3a...c1
```

JSON endpoints also accept `X-Arc-Token`; the TV uses the query form everywhere for
consistency. A missing or wrong token returns `401` with an empty body.

### 1.1 CORS

The TV app's origin is `file://` (a packaged widget) or `http://localhost`, so **every**
response needs:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, HEAD, POST, OPTIONS
Access-Control-Allow-Headers: Range, X-Arc-Token, Content-Type
Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges
```

The `POST` endpoints send `Content-Type: application/json`, which makes the browser issue an
`OPTIONS` preflight first. Answer it with `200` and the headers above, **before** any auth
check — a `401` on the preflight surfaces as an opaque network error on the TV, not as a
rejected token, and that is very hard to diagnose.

---

## 2. Discovery

A Tizen web app cannot use mDNS or UDP multicast, so discovery is an HTTP scan. A TV has no way
to read its own address, so the scan walks the `/24`s home routers actually hand out, in order,
and stops at the first one that answers — the phone is on the TV's network, so only one can hold
it.

```
for host in every address remembered from a past pairing:      (1.2 s timeout)
    GET http://{host}:8080/api/ping
for prefix in 192.168.1. 192.168.0. 192.168.100. 10.0.0.:
    for n in 1..254:
        GET http://{prefix}{n}:8080/api/ping    (350 ms timeout, 48 concurrent)
    stop as soon as this prefix answers
```

A TV that has paired before therefore finds its phone in one round trip and never sweeps.

**Every** responder with `service == "arcplayer"` is kept, not just the first: two phones on
the same Wi-Fi is normal, and the viewer picks one from a list. Worst case on a quiet LAN is
~1.5 s per prefix. The chosen host and its token are remembered in `localStorage`, so later
launches go straight to the library and only re-scan after a failed connect.

For debugging, `index.html?host=192.168.0.42` skips the scan and goes to that address, and
`?subnet=172.20.10.` scans one prefix only.

### `GET /api/ping`

Unauthenticated.

```json
{
  "service": "arcplayer",
  "version": 2,
  "device": "Pixel 8",
  "pairing": "open"
}
```

`pairing` is the one field a TV must not build logic around: a phone answers `open` today
whether or not a TV is already paired, because more than one TV may hold a token. `locked` and
`disabled` are reserved, not sent — nothing bound to a port can answer `disabled`, and a phone
that stopped serving simply stops answering.

`Access-Control-Allow-Origin: *`.

---

## 3. Pairing

Pairing is **device list + approval on the phone**. No QR code is required, and none is
needed for the TV to find the phone — discovery (§2) already provides the address.

The TV is the untrusted party: it can see that an Arc Player exists on the LAN, but it cannot
read the library until the phone says yes.

### 3.1 The flow

```
TV                                          Phone
 │  LAN scan                                 │
 ├─ GET /api/ping ──────────────────────────►│
 │◄─ {device:"Pixel 8", pairing:"open"} ─────┤
 │                                           │
 │  shows a list:  ┌──────────────────┐      │
 │                 │ Pixel 8          │      │
 │                 │ Galaxy S23       │      │
 │                 └──────────────────┘      │
 │  [user picks Pixel 8 with the remote]     │
 │                                           │
 ├─ POST /api/pair/request ─────────────────►│
 │   {tvModel:"UA55AU7100"}              │
 │◄─ {code:"7F2K9Q", expiresAt:…} ───────────┤
 │                                           │
 │                                     ┌─────┴──────────────┐
 │                                     │ TV "TV" wants to   │
 │                                     │ browse your        │
 │                                     │ library. [Allow]   │
 │                                     └─────┬──────────────┘
 │                                           │
 ├─ GET /api/pair/status?c=7F2K9Q ──────────►│  (polled every 2 s)
 │◄─ {state:"approved", token:"…"} ──────────┤
 │                                           │
 ├─ GET /api/library (token) ───────────────►│
```

The phone's prompt is a notification with **Allow** / **Deny**, or an in-app dialog when
Arc Player is open. If nobody answers within 120 s the code expires and the TV returns to the
device list.

### 3.2 `POST /api/pair/request`

```json
{ "tvModel": "UA55AU7100", "tvName": "TV" }
```

Response:

```json
{ "code": "7F2K9Q", "expiresAt": 1761955320000 }
```

Codes are 6 chars from `[A-Z0-9]`, single-use, valid 120 s. At most 3 pending at once; the
oldest is evicted.

**The phone must show the prompt when this arrives.** That is the whole security model: a
device on the Wi-Fi can ask, but only the person holding the phone can approve.

### 3.3 `GET /api/pair/status?c=7F2K9Q`

Polled by the TV every 2 s.

```json
{ "state": "pending" }
{ "state": "approved", "token": "9f3a…c1", "device": "TV" }
{ "state": "denied" }
{ "state": "expired" }
```

### 3.4 `POST /api/pair/approve` / `POST /api/pair/deny`

Called **in-process by the phone app** when the viewer answers the prompt. Not reachable over
the network.

```json
{ "code": "7F2K9Q" }
```

### 3.5 `POST /api/pair/revoke` (phone app only)

Drops a token. The TV's next request gets `401`, clears its stored token, and returns to the
device list.

### 3.6 Fallback: numeric code

If the prompt cannot be shown (phone locked by policy, app killed, notification permission
denied), Arc Player exposes a **"Connect a TV"** screen listing pending requests. The TV
displays the 6-character code large enough to read from the sofa, and it is typed there.
Same endpoints, same states.

### 3.7 QR (optional, not required)

A QR may be drawn on the TV as a *convenience* for the same flow:

```
arctv://pair?v=1&h=192.168.0.42&p=8080&c=7F2K9Q&n=Pixel%208
```

Scanning it should open the approval prompt directly. Nothing depends on this existing —
it is a shortcut for people who would rather scan than click. The TV must work without it.

---

## 4. Library

### 4.1 `GET /api/library?k=TOKEN`

The shelf answers with **works**, not files. Two uploads of one film and ninety episodes of one show are
one card each, and the files live under it in `items` — a TV that draws one card per file shows nine
identical posters for one series, which is what version 1 invited it to do.

The phone builds this response from its library and cached metadata only: `/api/library` never fetches
from the catalogue. Season names and episode stills are not persisted, so neither is exposed.

```json
{
  "version": 2,
  "generatedAt": 1761955200000,
  "groups": [
    {
      "key": "s:the_rookie",
      "isSeries": true,
      "title": "The Rookie",
      "year": 2018,
      "overview": "A 40-year-old gives up his construction business to become the oldest rookie in the LAPD.",
      "genres": ["Crime", "Drama", "Action"],
      "posterUrl": "/artwork/-3217499465312568105/poster?k=9f3a...c1",
      "backdropUrl": "/artwork/-3217499465312568105/backdrop?k=9f3a...c1",
      "logoUrl": null,
      "partCount": 6,
      "seasonCount": 2,
      "watchedAtMs": 1761951600000,
      "playId": "-3217499465312568105",
      "playResumeMs": 1200000,
      "resumeId": "-3217499465312568105",
      "resumeMs": 1200000,
      "resumeLengthMs": 2580000,
      "episodes": [
        {
          "season": 5,
          "episode": 1,
          "playId": "-3217499465312568105",
          "resumeMs": 1200000,
          "durationMs": 2580000,
          "watched": false,
          "copyIds": ["-3217499465312568105"]
        }
      ],
      "items": [
        {
          "id": "-3217499465312568105",
          "fileName": "The.Rookie.S05E01.1080p.WEB-DL.AAC2.0.x264-FLUX.mkv",
          "season": 5,
          "episode": 1,
          "sizeBytes": 2147483648,
          "durationMs": 2580000,
          "introEndMs": null,
          "outroStartMs": null,
          "outroEndMs": null,
          "width": 1920,
          "height": 1080,
          "mimeType": "video/x-matroska",
          "resumeMs": 1200000,
          "watchedAtMs": 1761951600000,
          "bitrateMbps": 6.66,
          "audioCodec": "aac",
          "needsRemux": false,
          "source": "local"
        }
      ]
    }
  ]
}
```

**The work** — what a card shows. Nothing here belongs to a single set of bytes.

| Field | Notes |
|---|---|
| `key` | The phone's own group key. Stable for a card while the phone holds it, so this — not an id — is what a TV uses to put focus back on the card it left |
| `isSeries` | A run of parts rather than one film |
| `title` | The matched catalogue title of whichever copy has one. Never a file name: `"The Rookie · Episode 4"` names a *part*, and a part belongs under a card, not on it |
| `year`, `overview`, `genres` | From the same catalogue match; `null` / empty when the phone never matched any copy |
| `posterUrl`, `backdropUrl` | One picture for the whole work, named by whichever copy holds it, because an episode borrows its show's art. Either may be `null`; the TV falls back to a title card |
| `logoUrl` | Authenticated `/artwork/{id}/logo?k=TOKEN` string, or `null` when no known card logo is available; raster only (§4.2), with title text as fallback |
| `episodes` | Episode rows below, one per season/episode rather than upload, ordered numerically by season then episode; `[]` for films |
| `partCount` | Distinct parts — copies of one part count once |
| `seasonCount` | Distinct seasons; `1` for a film |
| `watchedAtMs` | The newest stamp across its parts, and the only honest way to rank a hero: ranking by resume position picked whichever file was simply longest |
| `playId` | The file a Play button opens. This is the phone's own `PlayOrder` verdict — last-watched part, best copy of it — so TV and phone agree without the TV choosing |
| `playResumeMs` | Where Play picks up; for a series, the chosen episode row's deepest resume across copies. `0` when no bookmark remains |
| `resumeId` | The unfinished part, or `null` when nothing is half-watched. May name a different file than `playId`, and is what a progress bar on the card is drawn against |
| `resumeMs`, `resumeLengthMs` | That part's position and length, both `0` when `resumeId` is `null` |

**An episode** (`episodes[]`) — a playable slot, not a file. Work Play uses the same default copy for
its chosen episode. Rows reflect current progress after POSTs, not just the initial library snapshot.

| Field | Type | Notes |
|---|---|---|
| `season`, `episode` | number | Numeric ordering includes specials (`season: 0`); a missing season becomes `1` |
| `playId` | string | Saved copy first, otherwise most recently watched copy, otherwise first in the quality-sorted slot |
| `resumeMs` | number | Deepest resume across copies, filtered by the phone's `PlayOrder` (the final 90 seconds are not offered) |
| `durationMs` | number | Default copy's duration, falling back to the longest known copy; `0` if unknown |
| `watched` | boolean | The phone's `PlayOrder.standing` verdict using resume and explicit finished stamps; never inferred from recency (`watchedAtMs`) |
| `copyIds` | string[] | All copies of this episode in quality order, for the copy chooser; each refers to an `items[]` id |

**A part** (`items[]`) — one file, and every fact about bytes lives here.

| Field | Notes |
|---|---|
| `id` | Negative `stableId` as a **string**, at both levels. A JavaScript `Number` rounds anything past 2^53, and a rounded id is a 404 no log on the phone explains. Send it quoted |
| `fileName` | The copy's own name on the phone. `audioCodec` is read out of it, so this is the one field that lets a viewer check a badge |
| `season`, `episode` | Off the file's own name; both `null` for a film. A TV that numbers a kicker "S05 · Episode 1" builds it from these, never from `fileName` |
| `sizeBytes` | **Full** file size — the client relies on it for seeking |
| `durationMs` | Duration in milliseconds; `0` if unknown |
| `introEndMs`, `outroStartMs`, `outroEndMs` | Each a number in milliseconds or `null`; the phone supplies trusted cached timings only, never guesses or catalogue fetches for the TV |
| `audioCodec` | Lowercase short name — `dts-hd`, `truehd`, `eac3`, `ac3`, `flac`, `opus`, `aac`, `mp3` — or `null` when the file name says nothing. Never a guess |
| `needsRemux` | `true` only when *none* of the tracks the name claims can be decoded by this TV. A `…DTS.AC3…` dual-audio rip is `false`: the panel switches to the track it can hear |
| `resumeMs` | Where the phone left *this file*, from the same store its own UI reads; `0` if unwatched |
| `watchedAtMs` | When this copy was last opened, on either side; `0` if never |
| `bitrateMbps` | `sizeBytes * 8 / durationMs / 1000` — always a number, `0` when the length is unknown |
| `source` | `local` when the phone holds every byte, `telegram` when `/stream/{id}` must read the file out of the channel as it plays |

`Access-Control-Allow-Origin: *`.

Every part of the shelf is offered, kept or not: a film nobody downloaded is still watchable, and the
phone opens a cloud read session for it rather than hiding it. `items` arrives in the phone's own watch
order, copies of one part adjacent and the copy it would play first at the front of its part.

### 4.2 `GET /artwork/{id}/{kind}?k=TOKEN`

`kind` is `poster`, `backdrop` or `logo`; anything else, and any id the phone does not hold, is `404`.
All kinds require auth. The bytes are cached raster artwork — JPEG or PNG, with matching `Content-Type`.
A logo uses only the already-known card logo source, never a catalogue lookup or a generated SVG.
Missing/empty artwork is `404`; the TV falls back to a title card or, for a logo, title text.

The mock's logo is optional `media/logo.png`: absent or empty means `logoUrl: null` and `404` from the
logo route. It never generates or downloads a replacement.

There is no `/api/poster/{id}`; an app written against that path gets a 404 for every film.

---

## 5. Streaming

### 5.1 `HEAD /stream/{id}?k=TOKEN`

```
HTTP/1.1 200 OK
Content-Type: video/x-matroska
Content-Length: 2147483648
Accept-Ranges: bytes
Cache-Control: no-store
```

`Content-Length` is the byte count the file has on the phone's disk. The library only ever offers
complete copies, so that figure is also the film's full size; the two would part company only on
the growing-file path, which is not built (§5.2).

### 5.2 `GET /stream/{id}?k=TOKEN`

| Request | Response |
|---|---|
| *(none)* | `200`, body from byte 0 |
| `Range: bytes=0-` | `206`, body from 0 |
| `Range: bytes=N-` | `206`, N to EOF |
| `Range: bytes=N-M` | `206`, N..M inclusive |
| `Range: bytes=-N` | `206`, last N bytes |
| Malformed / multi-range | `416` + `Content-Range: bytes */<size>` |

```
HTTP/1.1 206 Partial Content
Content-Type: video/x-matroska
Content-Range: bytes 1048576-2147483647/2147483648
Content-Length: 2146435072
Accept-Ranges: bytes
Cache-Control: no-store
```

**Body semantics — built**

The phone opens the file, takes its `length()` as the total, and answers the range against the
bytes that exist. A read past the end returns nothing. Nothing in this path waits, because the
library only offers copies that are already complete on disk.

**Body semantics — the growing-file design, not built**

- Bytes are written **as they land on disk**; `read()` blocks otherwise.
- The connection stays open through a stall.
- Bytes are never fabricated. If a gap never fills, the socket closes early.

#### 5.2.1 Timeouts

Not built. These three timers belong to the growing-file path above; against a complete file no
read can starve, and none of them has fired. They are here so the phone and TV agree on what a
stall will mean when §9's second item is implemented.

| Timer | Value | On expiry |
|---|---|---|
| First byte | pre-buffer target (§5.2.3) | Send what exists |
| Inter-byte stall | 10 s | Log, keep waiting |
| Hard stall | 45 s | Close connection |

#### 5.2.2 Concurrency

- Max **2** concurrent streams.
- A new request for the same `id` cancels the previous one (latest wins).
- Cap exceeded → `503` + `Retry-After: 1`.

#### 5.2.3 Pre-buffer

Not built — no request waits for bytes today, so there is nothing to buffer before answering.
These are the targets for the growing-file path:

Request starting at 0 → `min(4 MB, 3 s)` contiguous.
Seek (start > 0) → `min(512 KB, 3 s)`.

### 5.3 `GET /api/subtitles/{id}?k=TOKEN`

SRT as `text/plain; charset=utf-8`, or `404`. The TV saves the body and hands the local path to
`setExternalSubtitlePath()`.

`404` is the common answer, and it is not a failure: the phone serves a caption only when its own
player already cached one to disk. A TV request never wakes Telegram — the films it plays are read
from disk, and the one download window belongs to whatever keep the viewer actually started. A film
watched on the phone with captions has them on the TV; a film never opened has none.

---

## 6. Progress

### 6.1 `GET /api/progress?k=TOKEN`

```json
{ "positions": { "-3217499465312568008": 4215000 } }
```

Every film on this phone with a place left in it, in one round trip — which is what a TV wants
when it decides what to put first. Keys are strings for the same reason ids are: a 64-bit number
read through JavaScript rounds to the nearest multiple of two, and two films would share one
bookmark.

`/api/library` already carries each file's own `resumeMs`; this is the whole shelf at once.

### 6.2 `POST /api/progress?k=TOKEN`

```json
{ "id": "-3217499465312568008", "positionMs": 4215000, "durationMs": 9780000 }
```

`204 No Content` when accepted, `400` when the body is not an object, carries no position, or carries
an id that is not a number, and `404` when the phone is not holding that film — a place kept for a
file the viewer cannot open is a ghost in Continue Watching. A `204` means the write was accepted,
not that a position now exists: a tail position is accepted and then forgotten.

Send `durationMs`. The phone prefers its own measurement of the film and uses the reported one
only when it has never opened the file, but either way the length is what tells the phone whether
`4215000` is a pause or an ending: a position inside the last min(8 %, 90 s) is not stored at all
— it removes the entry instead, so a viewer who sat through the credits finds the film finished at
home rather than offered "Resume at 1:58:04". A film shorter than 30 s is treated the same way, and
a position under 3 s leaves whatever is already stored alone — three seconds in is not a place worth
replacing one with.

There is no phone-side debounce, deliberately. The TV posts only once the play head has travelled
5 s, and a timer on the phone would swallow the writes that matter most — a forced seek, and the
final position when the viewer stops.

---

## 7. Error codes

| Code | Where | Meaning | TV behaviour |
|---|---|---|---|
| `AUTH` | 401 | Bad/missing token | Return to pairing |
| `NOTFOUND` | 404 | Unknown id, no artwork, no cached caption | Skip item, toast |
| `BAD` | 400 | A POST body the phone cannot read | Drop the write; it is best effort |
| `RANGE` | 416 | Unsatisfiable range | Re-request from 0 |
| `BUSY` | 503 | Connection cap | Retry after 1 s |
| `NOAUDIO` | library | Only DTS/TrueHD audio | Warning badge, and a plain-text notice on the film page |
| `DECODE` | player | AVPlay rejected the stream | Show codec hint |
| `NETWORK` | player | Socket/HTTP failure | Retry once, then error |
| `STALL` | player | Hard stall | Offer "restart from here" |

---

## 8. Flow examples

### 8.1 First pairing

```
TV    → sweep the common /24s :8080 /api/ping
TV    ← {"service":"arcplayer","device":"Pixel 8","pairing":"open"}
TV    → POST /api/pair/request  {"tvModel":"UA55AU7100","tvName":"Living Room"}
TV    ← {"code":"7F2K9Q","expiresAt":1761955320000}
PHONE → shows "Living Room wants to browse your library" — Allow / Deny
TV    → GET /api/pair/status?c=7F2K9Q      (every 2 s)
TV    ← {"state":"approved","token":"9f3a...c1"}
TV    → GET /api/library?k=9f3a...c1
```

### 8.2 Play

```
TV  → HEAD /stream/-3217499465312568008?k=...   → 200, Length=2147483648
TV  → GET  /stream/-3217499465312568008?k=...   Range: bytes=0-
SRV → 206, whole file on disk, streams from offset 0
```

### 8.3 Seek

```
TV  → avplay.seekTo(8000000)
TV  → closes the old connection, opens GET Range: bytes=<~1.76 GB>-
SRV → closes the superseded stream, 206 from that offset at once
```

A film the phone is serving is complete on disk, so a seek needs no network and lands
immediately. Serving a copy that is still downloading is the unbuilt half, and it is the case
that would need `advanceWindow(video, offset)` before writing, a 250 ms debounce on those calls,
and a block until the byte exists.

### 8.4 Stall

```
SRV → 45 s with no new bytes → close socket
TV  → avplay onerror → overlay "Stalled — retry"
TV  → user taps retry → GET Range from last known position
```

The 45 s watchdog is written on both sides and has never fired against a complete file, because
nothing in that path can starve. It is what a partially-downloaded film will use.

---

## 9. Deferred to v1.1

- A WebSocket at `/control` for phone-as-remote and live status. Not needed for v1 — the TV
  remote is the input device, and progress syncs over plain HTTP (§6).
- Streaming a copy that is still downloading, with the Telegram read-window moves §8.3 describes.
  Until then a film appears in the library only once a keep has finished it.
- Preparing an unsupported audio track for the TV. The phone detects DTS and TrueHD by file name
  and warns; it does not re-encode, and no route converts anything.
