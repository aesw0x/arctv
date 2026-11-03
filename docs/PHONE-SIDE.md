# Phone side — implementation guide

You own the Android side. This is what it has to expose, and how it maps onto the code you
already have. The wire format itself is in [`PROTOCOL.md`](PROTOCOL.md); this document is
about *where the data comes from*.

---

## 1. Scope

One foreground service and a small HTTP server inside Arc Player. **No new UI** except a
confirmation dialog when a TV pairs.

---

## 2. Three rules that decide whether this works

Get these wrong and nothing else matters.

### 2.1 `Content-Length` is the full Telegram size, never `File.length()`

TDLib writes the file progressively. At the moment the TV asks, the file on disk is usually
much smaller than the whole film.

- Advertise the **full** size from `CloudVideoItem.sizeBytes`.
- Write bytes as they arrive.
- Block when the next needed byte is not there yet.

If you advertise the on-disk size instead, every seek becomes a fresh `200 OK` for a
different length, and the player's timeline silently breaks — it will seek to the wrong place
and never recover.

### 2.2 The token goes in the query string

AVPlay's `open(url)` **cannot send custom headers**. There is no API for it. So:

```
http://192.168.0.42:8080/stream/-1001234567890?k=9f3a…c1
```

JSON routes can also accept `X-Arc-Token`, which makes `curl` pleasant. The media route must
work with the query parameter alone.

### 2.3 Never fabricate bytes

If a gap never fills, close the connection. Do not send zeros, do not send a short body and
pretend it is complete. AVPlay recovers from a dropped socket by re-requesting; it cannot
recover from plausible-looking garbage.

---

## 3. Where the data comes from

| Need | Source |
|---|---|
| Shelf chat id | `arc_player_prefs` → `movie_folder_chat_id` (`Long`) |
| Telegram credentials | already in the app's build config; the TV server reads them the way the Cloud tab does, so nothing new is stored |
| Repository | `CloudSession.repositoryFor(context, apiId, apiHash)` or `CloudSession.peekRepository()` |
| The catalogue | `repository.loadVideos(chatId)` |
| The growing file | `repository.localPathFor(video)` → path or `null` |
| Move the download window | `repository.advanceWindow(video, readPositionBytes)` |
| Abandon an old window | `repository.breakOffFetch(video)` |
| Resume positions | `arc_player_prefs` → `resume_positions` (JSON object, id → ms) |
| Subtitles | `repository.captionFileFor(video)` → `File?` |
| Manifest items | `repository.resolveLive(video)` before use |

`stableId` is the negative key already used by resume/favourites/history. Use it verbatim as
`{id}` in URLs — no encoding needed, digits and a minus sign.

---

## 4. Endpoints

### 4.1 `GET /api/ping` — no auth

Trivial, but it is what discovery depends on. Must answer in well under 400 ms and must set
`Access-Control-Allow-Origin: *`.

```json
{"service":"arcplayer","version":1,"device":"Pixel 8","pairing":"open"}
```

`device` is `"${Build.MANUFACTURER} ${Build.MODEL}"`. `pairing` is `open` until a TV is
paired, then `locked`.

### 4.2 `GET /api/library?k=…`

```kotlin
val chatId = prefs.getLong("movie_folder_chat_id", 0L)
val videos = repository.loadVideos(chatId)
```

Then map each `CloudVideoItem` to the JSON shape in `PROTOCOL.md` §4.1. Two derived fields
matter:

```kotlin
val bitrateMbps = sizeBytes * 8.0 / durationMs / 1000.0
val needsRemux = audioCodecOf(video) in setOf("dts", "truehd")
```

`resumeMs` comes from the `resume_positions` JSON, defaulting to `0`.

`posterUrl` is optional. If you already cache TMDB artwork, point at it and add
`GET /api/poster/{id}`. If not, omit the field and the TV draws a title card — that is a
perfectly good v1.

### 4.3 `GET /stream/{id}?k=…` — the core

```kotlin
val video = repository.loadVideos(chatId).firstOrNull { it.stableId == id }
    ?: return notFound()
val live = repository.resolveLive(video)
val path = repository.localPathFor(live) ?: return unavailable()
```

Then:

1. Parse the `Range` header (`RangeHeader.parse` in the handoff bundle does this).
2. `repository.advanceWindow(live, range.start)` — **suspend**, call it before writing.
3. Build a `GrowingFileSource(File(path), live.sizeBytes, mime)` and stream it.

`advanceWindow` is what tells TDLib "the viewer is at byte N now". Without it the file only
ever contains whatever the download happened to fetch first, and every seek stalls.

If the jump is large (say more than 64 MB), call `repository.breakOffFetch(live)` first so
TDLib stops filling a window nobody is reading.

**Debounce.** Rapid scrubbing produces a burst of range requests. Coalesce
`advanceWindow` calls to at most one per 250 ms per file, or you will hit Telegram's flood
limits.

**One stream per id.** When a new request arrives for an id that already has one, cancel the
old one. Two `advanceWindow` calls racing on the same file fight each other.

### 4.4 `GET /api/progress?k=…` and `POST /api/progress?k=…`

Read and write the same `resume_positions` JSON the UI already uses, so the TV and the phone
agree on where you stopped. Debounce writes to one per 5 s per id — the TV posts every 10 s
and that should not become 360 prefs commits an hour.

### 4.5 `GET /api/subtitles/{id}?k=…`

```kotlin
repository.captionFileFor(video)?.readText() ?: return notFound()
```

Serve as `text/plain; charset=utf-8`. SRT is what AVPlay's `setExternalSubtitlePath` wants.

### 4.6 Pairing — `/api/pair/*`

Defer this. Get the TV playing first with a token you read out of prefs by hand, then add
pairing. The flow is in `PROTOCOL.md` §3; the only non-obvious part is that the phone
**validates that the IP in the QR is on its own subnet** before connecting anywhere.

---

## 5. Lifecycle

- Foreground service, type `dataSync`, started from `Application.onCreate` when enabled.
- `PARTIAL_WAKE_LOCK` for the duration — the TV keeps streaming with the phone screen off.
- Android 15 caps `dataSync` at ~6 h/day. Longer than any film; just make the notification
  honest about it.
- Bind `0.0.0.0`, but never expose the port beyond the LAN.

---

## 6. Traps, in the order they will bite you

| Trap | Symptom | Fix |
|---|---|---|
| `Content-Length` from `File.length()` | seeks land in the wrong place | use `sizeBytes` |
| No `advanceWindow` call | plays 20 s then stalls forever | call it per request |
| `advanceWindow` on every request | Telegram rate-limits, downloads stop | debounce 250 ms |
| Two streams for one id | both stall, window thrashes | latest request wins |
| `Range` ignored | player re-downloads from 0 on seek | implement 206 properly |
| Multi-range parsed loosely | wrong bytes served | reject with 416 |
| Token in a header only | AVPlay gets 401 | query parameter |
| No `Access-Control-Allow-Origin` | TV can list nothing, media still plays | add `*` |
| Serving `null` from `localPathFor` | 500s on first play | treat as 503, retry |

---

## 7. Acceptance

```powershell
$base = "http://<phone>:8080"; $k = "<token>"

curl.exe -i "$base/api/ping"
curl.exe -I "$base/stream/-1001234567890?k=$k"
curl.exe -i -H "Range: bytes=0-0"          "$base/stream/-1001234567890?k=$k"
curl.exe -i -H "Range: bytes=1048576-2097151" "$base/stream/-1001234567890?k=$k"
curl.exe -i -H "Range: bytes=999999999999-"   "$base/stream/-1001234567890?k=$k"   # 416
```

Then open the media URL in **VLC on a laptop** — before touching the TV. If VLC can play it
start to finish and seek both directions, AVPlay will too. If VLC cannot, the TV will not, and
you will have wasted an install cycle finding out.

The single most useful test: seek to 90 % of a film that is only 10 % downloaded, and time
how long until playback resumes. Under ~8 s is healthy. Over 30 s means the window logic is
aiming wrong.
