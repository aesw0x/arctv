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

**How it reads today:** the phone serves only copies a keep finished, so every byte of the film
is already on the device and the advertised length *is* the file's own length. §2.1 is the rule
for the day a still-downloading copy is ever offered, which is the part that is not built.

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

Everything the TV is offered already sits on the phone. No route wakes TDLib: one socket is
feeding the film next door, and a route that goes to Telegram to answer a metadata question
takes the download window with it.

| Need | Source |
|---|---|
| Which shelf | `arc_player_prefs` → `movie_folder_chat_id` (`Long`) |
| The catalogue | `files/telegram/shelf_manifest.txt`, decoded by `ShelfManifest.decode(row, chatId)` |
| Which copies are playable | `files/telegram/download_ledger.txt`: a row that is complete *and* filed under the catalog folder (`DownloadLedger.isCatalogHandle`) |
| Titles, year, synopsis, genres, artwork | `arc_player_prefs` → `media_cards` and `title_details`, keyed by stable id |
| Lengths the manifest does not carry | the player's measurements, `arc_player_prefs` → `known_lengths` (id → ms) |
| Resume positions | `ResumeBlob` — the single owner of the `resume_positions` prefs key |
| Codec of a copy | `AudioTag.of(fileName)`, read out of the file name |
| Subtitles | `files/telegram/shelf_subtitles.txt` + `cacheDir/captions/{stableId}.{ext}`, matched with `SubtitleMatch` |
| Telegram credentials | not used by this server at all |

`stableId` is the negative key already used by resume/favourites/history. It travels in URLs and
in JSON as a **string**: a JavaScript reader rounds anything past 2^53, so `-3217499465312568008`
arrives as `…568000` and two films share one bookmark. The phone reads the path segment back with
`toLongOrNull()`.

When the shelf has nothing playable — a phone with no keeps, or a TV paired to a emulator rig —
the server can fall back to one demo file in the app's external files directory, which is how the
stream path is tested without a library.

---

## 4. Endpoints

### 4.1 `GET /api/ping` — no auth

Trivial, but it is what discovery depends on. Must answer in well under 400 ms and must set
`Access-Control-Allow-Origin: *`.

```json
{"service":"arcplayer","version":2,"device":"Pixel 8","pairing":"open"}
```

`device` is `"${Build.MANUFACTURER} ${Build.MODEL}"`. `pairing` is always `open`: a phone can
serve more than one TV, so what gates a library is not a slot being taken but the viewer tapping
Allow.

### 4.2 `GET /api/library?k=…`

Two reads sit behind this route. `ShelfLibrary.items(context)` answers one file for every row the
manifest carries, and `ShelfLibrary.groups(context)` — what the route serialises — folds those
files into works:

- The fold is the phone's own `TitleGroups.group`, asked of the same names its grid reads, so the
  two shelves cannot disagree about what one work is. A show uploaded episode by episode is one
  card on the television, not ninety.
- Which part a card opens is `PlayOrder.nextCopy` over that work's slots, and which part is still
  underway is `PlayOrder.progress`. Those two give `playId` / `playResumeMs` and `resumeId` /
  `resumeMs`, which is the same verdict the phone's own Play button gets. A television that opened
  `items[0]` would be picking an episode for the viewer instead of resuming the one they are
  sitting in.
- `items` arrives in the phone's watch order — copies of one part adjacent, the copy it would play
  first at the front of its part — so a card is a work plus the file the phone would hand over.

Each part becomes the "A part" shape in `PROTOCOL.md` §4.1. Three fields are derived rather than
copied:

```kotlin
val bitrateMbps = sizeBytes * 8.0 / durationMs / 1000.0        // 0.0 when durationMs is 0
val audio = AudioTag.of(video.title)                            // codec from the file name
// audio.codec -> "audioCodec"      audio.unsupported -> "needsRemux"
```

`resumeMs` comes from `ResumeBlob.read(context)`, defaulting to `0`, and `source` reads the ledger:
a copy with a complete offline file says `local`, everything else says `telegram` and streams.

`AudioTag` is a filename reader, not a probe: there is no MediaExtractor, no ffprobe and no
demuxer involved. It recognises the DTS family, Dolby (AC-3 / E-AC-3), FLAC, Opus, AAC and MP3,
and says "the TV cannot hear this" only for the DTS family and TrueHD — the tracks a Samsung
Tizen panel genuinely drops. Two rules make it safe to print a badge from:

- A name claiming a second, playable track (the common `…DTS.AC3…` dual-audio rip) is **not** a
  warning, because the TV will simply switch to the track it can decode.
- A name that says nothing about its audio answers `audioCodec: null`, and the TV draws no badge.
  An absent codec is honest; a guessed one is a wrong claim about someone's file.
- A codec welded to its channel count still reads: `AAC5.1`, `DDP5.1`, `TRUEHD.7.1`. Release names
  write the two together, and a badge that appears only on the spaced-out spelling is a badge that
  mostly does not appear.

Checked against a debug build on a real shelf on 2026-11-03: `English DDP5.1 x265` → `eac3`,
`EAC3.H265` → `eac3` and not the `ac3` sitting inside it, `AAC5.1-[YTS.MX]` → `aac`,
`WEB-DL.OPUS.x265` → `opus`, `BluRay (1080p 10bit x265 SDR Engl` → `null`; and on four names
written into the manifest by hand for the warning path, `DTS-HD.MA.5.1` → `dts-hd` + `needsRemux`,
`TRUEHD.7.1` → `truehd` + `needsRemux`, `DTS.x264.AC3` → `ac3` and no warning.

`posterUrl` and `backdropUrl` point at `GET /artwork/{id}/poster` and `/artwork/{id}/backdrop`,
which serve the TMDB artwork the app already cached. Either can be `null` — a film the phone has
never matched has no artwork to offer — and the TV then draws its own title card.

### 4.3 `GET /stream/{id}?k=…` — the core

What is built: the id is looked up in the shelf, its ledger row gives the path, and
`CompleteFileSource` streams that file with real `Range` support. One stream per id — a newer
request closes the older one — and a `HEAD` takes no slot, so checking a size never drops a
viewer.

What is *not* built is everything below, which is what a copy that is still downloading needs.
Today such a copy is simply absent from the library:

```kotlin
val live = repository.resolveLive(video)
val path = repository.localPathFor(live) ?: return unavailable()
repository.advanceWindow(live, range.start)   // suspend, before writing
```

`advanceWindow` is what tells TDLib "the viewer is at byte N now". Without it the file only
ever contains whatever the download happened to fetch first, and every seek stalls. If the jump
is large (say more than 64 MB), call `repository.breakOffFetch(live)` first so TDLib stops
filling a window nobody is reading, and coalesce `advanceWindow` to one per 250 ms per file or
rapid scrubbing hits Telegram's flood limits.

### 4.4 `GET /api/progress?k=…` and `POST /api/progress?k=…`

`GET` answers `{"positions": {"<id>": ms}}` — string keys, for the same reason the ids are
strings.

`POST` takes `{id, positionMs, durationMs}` and answers `204` on an accepted write, `400` on a
body that is not an object or carries no position, and `404` for an id this phone is not
holding. `durationMs` is optional but worth sending: the phone prefers its own length for the
film and uses the reported one only when it has never measured it.

Two things make this safe to write at all:

- **One owner.** `ResumeBlob` is the only code in the app that touches the `resume_positions`
  key, and every write is a locked read-modify-write of one id. The old path — the UI holding a
  map in memory and serializing the *whole* thing every 1.5 s — would silently erase anything a
  TV posted between two of its own writes. The UI now mirrors the blob and re-reads it on
  `ON_RESUME`, so a place saved on the sofa is on the phone's Continue Watching rail the moment
  you pick the phone back up.
- **The phone's own rule.** A number from the sofa goes through `ResumeRules.decide` like any
  tick from the player: the last min(8 %, 90 s) of a film is an ending, so the entry is removed
  rather than stored, and a film under 30 s gets no bookmark. Without that, a viewer who sat
  through the credits on the TV would come home to "Resume at 1:58:04".

There is no phone-side write debounce, deliberately: the TV already posts only once the head has
travelled 5 s, and a timer here would swallow the one write that matters — a forced seek, or the
final position when the viewer stops.

Checked against a debug build on 2026-11-03: a mid-film position stored and came back through
`/api/library` as `resumeMs`; two positions inside the tail answered `204` and left no entry; an id
this phone does not hold answered `404`, a body of prose answered `400`, and no token answered
`401`. With six positions the viewer's own player had written there already, the TV's two writes
landed beside them rather than over them, and all eight survived the process being stopped and
started again — which is the merge this route exists to be safe about.

### 4.5 `GET /api/subtitles/{id}?k=…`

```kotlin
ShelfLibrary.captionFileFor(context, item)?.let { streamIt(it) } ?: return notFound()
```

Served as `text/plain; charset=utf-8` with `Cache-Control: no-store`; SRT is what AVPlay's
`setExternalSubtitlePath` wants, and a caption the browser has to guess the type of is a caption
nobody reads. `HEAD` answers the headers with an empty body.

`captionFileFor` is a **disk** lookup — the subtitle manifest plus `cacheDir/captions` — and it
answers `404` when the phone has never cached a caption for that film. It is deliberately not
`repository.captionFileFor(video)`: that one will walk to Telegram to fetch a file, and a route
that does so wakes the library and takes TDLib's single download window from a keep the viewer
actually started.

Checked on the same build: a film with a caption in `cacheDir/captions` answered `200`,
`text/plain; charset=utf-8` and the exact bytes of the file; the film beside it, which the phone
has never opened with captions, answered `404`; without a token, `401`; and a `HEAD` returned the
headers with no body.

The match is the same one the phone's own player uses: the caption's file name has to line up
with the video's, and when several do, the one in the viewer's language wins.

### 4.6 Pairing — `/api/pair/*`

Built. `POST /api/pair/request` hands out a six-character code (120 s TTL, three pending at a
time), `GET /api/pair/status?c=…` is what the TV polls, and the decision itself is made on the
phone's own screen — a prompt in Arc Player with Allow and Deny, not an HTTP route. There is no
`POST /api/pair/approve` on a real phone; that route exists only in the mock server, where a
browser tab stands in for the phone. The approved token then rides every request the TV makes,
as `?k=` on all routes and as the `X-Arc-Token` header where one is allowed.

The flow is in `PROTOCOL.md` §3. The direction is the part worth stating: the phone **never
connects to anything**. It binds `:8080`, answers `/api/ping` to whoever sweeps the LAN, and holds
the decision on its own screen. The TV is the only client of the pairing exchange.

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
| `Range` ignored | player re-downloads from 0 on seek | implement 206 properly |
| Multi-range parsed loosely | wrong bytes served | reject with 416 |
| Token in a header only | AVPlay gets 401 | query parameter |
| No `Access-Control-Allow-Origin` | TV can list nothing, media still plays | add `*` |
| Id sent as a JSON number | the last three digits of a 64-bit id silently change | send ids as strings |
| Serving `null` from `localPathFor` | 500s on first play | `404`: this phone does not hold that film |

Three rows in the earlier draft of this table — `Content-Length` from `File.length()`, a missing
`advanceWindow` call, and `advanceWindow` called too often — are traps on the growing-file path
only. The phone serves nothing but complete copies today (§4.3), so `File.length()` *is* the right
total, and there is no window to aim or to rate-limit. They come back the day a still-downloading
film joins the library.

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
