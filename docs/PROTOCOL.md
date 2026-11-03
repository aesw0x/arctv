# ArcTV Wire Protocol

Contract between **Arc Player** (phone, server) and the **ArcTV** Tizen app (TV, client).

Version `1` — bump on breaking change; both sides reject unknown majors.

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
  "version": 1,
  "device": "Pixel 8",
  "pairing": "open"
}
```

`pairing`: `open` (accepting requests), `locked` (a TV is already paired), `disabled`.

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

```json
{
  "version": 1,
  "generatedAt": 1761955200000,
  "items": [
    {
      "id": -1001234567890,
      "title": "Blade Runner 2049",
      "chatTitle": "Movies",
      "sizeBytes": 2147483648,
      "durationMs": 9780000,
      "width": 1920,
      "height": 1080,
      "mimeType": "video/x-matroska",
      "posterUrl": "/api/poster/-1001234567890?k=9f3a...c1",
      "needsRemux": false,
      "audioCodec": "eac3",
      "resumeMs": 4215000,
      "bitrateMbps": 1.76
    }
  ]
}
```

| Field | Notes |
|---|---|
| `id` | Negative `stableId`, same key as Arc Player's local maps |
| `sizeBytes` | **Full** file size — the client relies on it for seeking |
| `needsRemux` | `true` when audio is DTS/TrueHD (§6.6 of the plan) |
| `audioCodec` | Short name for the badge |
| `resumeMs` | From `resume_positions`; `0` if unwatched |
| `bitrateMbps` | `sizeBytes * 8 / durationMs / 1000` — drives the warning |

`Access-Control-Allow-Origin: *`.

### 4.2 `GET /api/poster/{id}?k=TOKEN`

`image/jpeg`, cached thumbnail. `404` → the TV draws a title card.

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

`Content-Length` is the **full Telegram file size**, not the on-disk size.

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

**Body semantics**

- Bytes are written **as they land on disk**; `read()` blocks otherwise.
- The connection stays open through a stall.
- Bytes are never fabricated. If a gap never fills, the socket closes early.

#### 5.2.1 Timeouts

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

Request starting at 0 → `min(4 MB, 3 s)` contiguous.
Seek (start > 0) → `min(512 KB, 3 s)`.

### 5.3 `GET /api/subtitles/{id}?k=TOKEN`

SRT as `text/plain; charset=utf-8`, or `404`. Fed to `setExternalSubtitlePath()`.

---

## 6. Progress

### 6.1 `GET /api/progress?k=TOKEN`

```json
{ "positions": { "-1001234567890": 4215000 } }
```

### 6.2 `POST /api/progress?k=TOKEN`

```json
{ "id": -1001234567890, "positionMs": 4215000 }
```

`204 No Content`. The phone debounces writes to `resume_positions` (max 1 write / 5 s per id).

---

## 7. Error codes

| Code | Where | Meaning | TV behaviour |
|---|---|---|---|
| `AUTH` | 401 | Bad/missing token | Return to pairing |
| `NOTFOUND` | 404 | Unknown id | Skip item, toast |
| `RANGE` | 416 | Unsatisfiable range | Re-request from 0 |
| `BUSY` | 503 | Connection cap | Retry after 1 s |
| `NOAUDIO` | library | DTS/TrueHD track | "Prepare for TV" button |
| `DECODE` | player | AVPlay rejected the stream | Show codec hint |
| `NETWORK` | player | Socket/HTTP failure | Retry once, then error |
| `STALL` | player | Hard stall | Offer "restart from here" |

---

## 8. Flow examples

### 8.1 First pairing

```
TV    → sweep the common /24s :8080 /api/ping
TV    ← {"service":"arcplayer","device":"Pixel 8","pairing":"open"}
TV    → POST /api/pair/request  {"tvModel":"UA55AU7100"}
TV    ← {"code":"7F2K9Q","expiresAt":1761955320000}
TV    → renders QR: arctv://pair?v=1&h=192.168.0.42&p=8080&c=7F2K9Q&n=Pixel%208
PHONE → scans, confirms, approves in-process
TV    → GET /api/pair/status?c=7F2K9Q      (every 2 s)
TV    ← {"state":"approved","token":"9f3a...c1"}
TV    → GET /api/library?k=9f3a...c1
```

### 8.2 Play

```
TV → HEAD /stream/-1001234567890?k=...        → 200, Length=2147483648
TV → GET  /stream/-1001234567890?k=...  Range: bytes=0-
SRV → advanceWindow(video, 0)
SRV → 206, pre-buffers 4 MB, then streams
```

### 8.3 Seek

```
TV  → avplay.seekTo(8000000)
TV  → closes old connection, opens GET Range: bytes=<~1.7GB>-
SRV → cancels previous stream, advanceWindow(video, 1750000000)
SRV → 206, blocks until that offset is on disk
```

### 8.4 Stall

```
SRV → 45 s with no new bytes → close socket
TV  → avplay onerror → overlay "Stalled — retry"
TV  → user taps retry → GET Range from last known position
```

---

## 9. Deferred to v1.1

A WebSocket at `/control` for phone-as-remote and live status. Not needed for v1 — the TV
remote is the input device, and progress syncs over plain HTTP (§6). Left out to keep the
first version small.
