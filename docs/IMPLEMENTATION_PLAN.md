# ArcTV — Implementation Plan

**Status:** revised for variant A (TV-side UI)
**Target:** Samsung Crystal UHD 43″ (2021), Tizen 6.0
**Source:** the Arc Player repository — the phone half is developed there, not here

---

## 1. Objective

Watch the Telegram library already catalogued by Arc Player on the living-room TV.

- **Phone** = headless server. Holds the Telegram session, serves bytes over the LAN.
- **TV** = full client. Netflix-style poster grid, browsed with the TV remote, decoded by AVPlay.
- **Pairing** = QR code on the TV, scanned once with the phone.

## 2. Non-goals

| Out of scope | Why |
|---|---|
| Video transcoding on the phone | Cannot re-encode 4K in real time. Audio conversion only. |
| Cloud relay / internet exposure | LAN only. Keeps credentials and library private. |
| Tizen Store submission | Sideload via Tizen Studio. |
| Editing the original Arc Player folder | Hard requirement. The phone server is written there, this repository only consumes its API. |
| Phone-as-remote | Dropped from v1. The TV remote is the input device. |

---

## 3. Verified constraints

### 3.1 TV — 2021 Crystal UHD 43″

| Property | Value | Consequence |
|---|---|---|
| Platform | Tizen 6.0, KANT-SU2E (`T-KSU2E`) | 2021-era runtime |
| Web engine | **Chromium M76** | ES2017; vanilla JS only, no framework runtime |
| 4K decode | **AVPlay only** | MSE is FHD-only; `<video>` caps at 1080p |
| Video | HEVC 4K60/50 Mbps, AV1 4K60/40, VP9 4K60/50, H.264 4K30/50 | Ample headroom |
| Containers | MKV, MP4, TS, MOV, AVI, WebM, … | Matroska fine |
| Audio | AC-3, DD+, AC-4, AAC, HE-AAC, MP3, Opus, Vorbis, WMA, LPCM | **DTS unsupported** |
| Network | Wi-Fi 5 | Shared radio with the phone |
| Dev mode | Already `"1"` | Sideload-ready |
| Open ports | 8001, 8002, 7678, 9197 | 8002 = remote WS, 9197 = DLNA renderer |

### 3.2 Phone — Arc Player (forked)

| Property | Value | Consequence |
|---|---|---|
| `minSdk` / `targetSdk` | 31 / 35 | Android 15 FGS rules apply |
| TDLib | `com.github.tdlibx:td:1.8.56` | Streaming primitives present |
| Player | `libvlc-all:3.6.0` | Phone-local playback unchanged |
| Existing FGS | `DownloadService`, `dataSync`, wake lock | Pattern to clone |
| HTTP server | **none** (verified) | The one genuinely new piece |
| Prefs | `arc_player_prefs` → `movie_folder_chat_id`, `resume_positions` | Server reads these |
| Source size | 169 files / 134 MB (mostly TDLib + VLC `.so`) | Fork is practical |

### 3.3 Network reality

Every byte crosses the air **three times**: AP→phone (Telegram download), phone→AP
(serving), AP→TV (delivery). Airtime, not decode, is the binding constraint.

- 1080p (~8–15 Mbps) → ~45 Mbps of airtime. Comfortable.
- Telegram caps files at 2 GB (4 GB Premium), so real content is already compressed —
  see §6.7.

---

## 4. Architecture

### 4.1 Options considered

| Option | TV work | Reuse | Verdict |
|---|---|---|---|
| PC relay | Full Tizen app | Stream logic only | Rejected — needs an always-on PC and a second login |
| **Phone = server, TV = full UI** | Poster grid + player | Full cloud stack | **Chosen** |
| Phone = remote, TV = dumb player | ~200-line shell | Full cloud stack | Rejected — user wants TV-side browsing |
| Phone as DLNA server | None | Minimal | Poor UX, no artwork control |
| Screen mirroring | None | None | Worst experience |

### 4.2 Runtime topology

```
┌──────────────────────────────┐                  ┌──────────────────────────────┐
│  Arc Player (phone, headless)│                  │  ArcTV (Tizen web app)       │
│                              │  GET /api/library│                              │
│  CloudRepository             │◄─────────────────┤  library.js   poster grid    │
│    └─ TDLib growing file     │                  │  pairing.js   QR + scan flow │
│                              │  GET /poster/{id}│  focus.js     remote keys    │
│  TvServerService (FGS)       │◄─────────────────┤                              │
│    ├─ LocalStreamServer      │                  │  player.js                   │
│    ├─ RangeStream            │  HTTP Range      │    └─ webapis.avplay         │
│    └─ PairingApi             ├─────────────────►│         (hardware decode)    │
│                              │  /stream/{id}    │                              │
└──────────────────────────────┘                  └──────────────────────────────┘
                                                              │
                                                    TV remote (arrow / OK / back)
```

The phone has **no new UI except a pairing screen**. It can be locked, screen off, in a pocket.

### 4.3 Why progressive HTTP + Range, not HLS

Telegram hands us a growing file on disk. Range over a growing file is a direct mapping.
HLS would require segmenting and remuxing on the fly — more failure modes, no benefit at
1080p, and AVPlay handles `206` well.

---

## 5. Components

### 5.1 Fork strategy

`android/` is a **copy** of Arc Player's source (excluding `build/`, `.gradle/`, `.git/`,
`.idea/`). All modification happens there. The original folder is never written to.

The fork's identity changes: `applicationId` → `com.aeswox.arctv`, so both apps can coexist
on the phone during development.

### 5.2 Phone — new package `com.aeswox.arcplayer.tvserver`

| File | Responsibility | ~LOC |
|---|---|---|
| `TvServerService.kt` | FGS, wake lock, notification, start/stop | 150 |
| `LocalStreamServer.kt` | NanoHTTPD bootstrap, routing, CORS, token check | 200 |
| `RangeStream.kt` | **Core.** Blocking `InputStream` over the growing file | 250 |
| `LibraryApi.kt` | `/api/library`, `/api/poster/{id}` | 160 |
| `PairingApi.kt` | `/api/pair/*` — request, status, approve, revoke | 180 |
| `ProgressApi.kt` | `/api/progress` GET/POST against `resume_positions` | 90 |
| `SubtitleApi.kt` | `/api/subtitles/{id}` via `captionFileFor()` | 80 |
| `TvServerConfig.kt` | Port, token, paired-device list, persisted in prefs | 90 |
| `RemuxGate.kt` | DTS detection → `needsRemux` flag | 120 |
| `PairingScannerScreen.kt` | Compose screen: camera + confirm dialog | 200 |

**Dependencies added to the fork:**
- `org.nanohttpd:nanohttpd:2.3.1` — HTTP server (one small jar) — added at M0
- `com.journeyapps:zxing-android-embedded:4.3.0` — QR scanning — added at M0, used at M3
- `dev.ffmpegkit-maintained:ffmpeg-kit-full:8.1.7` — DTS→AC-3 conversion (§6.6) — **added at
  M6 only.** It adds ~200 MB of native libraries, so it stays out of the build until
  `RemuxGate` exists. Resolution and native-lib merging were verified on 2026-11-01.

**New permissions:** `CAMERA` (pairing only).

**Threading:** NanoHTTPD spawns one thread per connection; a streaming request occupies its
thread blocking in `read()`. That is intentional. Cap: 2 concurrent streams.

### 5.3 TV — `tizen/`

| File | Responsibility | ~LOC |
|---|---|---|
| `config.xml` | Widget manifest, `tv-samsung` profile, `required_version="6.0"` | 40 |
| `index.html` | Screen containers: pairing, grid, detail, player | 120 |
| `js/discovery.js` | LAN scan for `/api/ping`, cache in `localStorage` | 90 |
| `js/pairing.js` | QR render + poll for approval; numeric fallback | 130 |
| `js/api.js` | Authenticated fetch wrapper, error mapping | 110 |
| `js/focus.js` | Focus engine: arrow/OK/back, scroll, debounce | 200 |
| `js/library.js` | Poster grid, lazy image load, sorting | 220 |
| `js/detail.js` | Title, synopsis, Play button, audio badge | 120 |
| `js/player.js` | AVPlay lifecycle + overlay controls | 320 |
| `js/progress.js` | Periodic position POST, resume on open | 80 |
| `js/qrgen.js` | Vendored QR encoder (kazuhikoarase, MIT, ~10 KB) | — |
| `css/app.css` | TV-safe layout, focus rings, poster aspect | 260 |

No framework — M76 plus vanilla JS. `qrgen.js` is vendored because Chromium M76 has no
built-in QR API.

### 5.4 Reuse map — copied upstream logic

| Copied file | Role in the server | Change needed |
|---|---|---|
| `stream/StreamWindow.kt` | Re-aim arithmetic | **None** |
| `stream/ByteRate.kt` | Throughput estimate for the bitrate gate | None |
| `stream/BufferGuard.kt` | Underrun detection | None |
| `cloud/CloudWindowPlanner.kt` | `WindowFacts` → `WindowCommand` | None |
| `cloud/MkvSeekIndex.kt` | Time→byte for MKV | None |
| `cloud/CloudModels.kt` | `CloudVideoItem` | None |
| `cloud/CloudIds.kt` | `stableId` derivation | None |
| `cloud/CloudSession.kt` | Repository lifetime | None |
| `cloud/DownloadService.kt` | FGS pattern | Clone into `TvServerService` |
| `Playable.kt` | Shared interface | None |

Their unit tests come along so the ported logic stays verified.

---

## 6. Stream engine — the part that decides success

### 6.1 The contract

- `Content-Length` is the **full Telegram file size** from TDLib metadata, not the on-disk
  size. Lying here breaks seeking permanently.
- The body is an `InputStream` that **blocks** until the requested offset is on disk.
- Headers flush immediately; AVPlay's timeout is on data, not on response start.

### 6.2 Seek

AVPlay closes the old connection and opens a new one with a new `Range`. The server:

1. Cancels the previous stream for that `stableId` (latest wins).
2. Calls `repository.advanceWindow(video, startByte)`.
3. If the jump is far, `breakOffFetch(video)` first so TDLib stops filling the old window.
4. Blocks until `startByte` is readable.

### 6.3 Stall policy

| Condition | Action |
|---|---|
| No new bytes for 10 s | Keep the connection open; log |
| No new bytes for 45 s | Close with a partial body |
| TDLib idle and bytes missing | One `advanceWindow` retry, then fail |

Closing early beats hanging: AVPlay recovers from a dropped connection by re-requesting, but a
silent hang is unrecoverable.

### 6.4 Pre-buffer

Before the first body byte on a `bytes=0-` request, wait for `min(4 MB, 3 s)` contiguous.
On a seek, `min(512 KB, 3 s)`.

### 6.5 Audio gate

`RemuxGate` inspects the container's audio codec before advertising the stream:

- AC-3 / E-AC-3 / AAC / MP3 / Opus / Vorbis → play as-is.
- DTS / TrueHD → `needsRemux: true` in the payload.

What `needsRemux` means is decided in §6.6.

### 6.6 DTS titles — decided: convert on the phone

Your TV decodes AC-3, DD+, AC-4, AAC, MP3, Opus, Vorbis, FLAC, WMA and LPCM — but **not
DTS**, which Samsung dropped on 2021 models. Playing one as-is gives picture but no sound.

**Decision: convert (option B).** No external decoder is available, so the phone re-encodes
the audio track once and caches the result.

- Video is **copied bit-for-bit** (`-c:v copy`) — no quality loss, no re-encode cost.
- Audio is transcoded `dts → ac3 640k`, a 5.1 AC-3 track the TV decodes natively.
- Output lands in app cache as `<stableId>.tv.mp4` (MP4 muxer, because the audio changes).
- The TV shows a **"Prepare for TV"** button on any title with `needsRemux: true`, with
  progress reported back over `/api/progress`.
- Conversion needs the whole file on disk first, so it is always an explicit action.

Library: `dev.ffmpegkit-maintained:ffmpeg-kit-full:8.1.7`. The original `com.arthenica`
artifact was retired and pulled from Maven Central in 2025; this fork keeps the same
`com.arthenica.ffmpegkit` API, so call sites are unchanged.

Cost: ~35 MB APK, a few minutes per film, one-time cache storage per title.

### 6.7 Bitrate gate — not a resolution cap

Decode is not the constraint. The TV handles HEVC 4K60 at 50 Mbps fine. Delivery is.

Rather than capping by resolution, the server computes average bitrate from metadata:

```
mbps = sizeBytes * 8 / durationMs / 1000
```

and compares against measured LAN headroom (`ByteRate` over the first ~10 s):

| Ratio (stream / headroom) | Action |
|---|---|
| < 0.5 | Play silently |
| 0.5 – 0.8 | Play; show a "high bitrate" badge on the TV |
| > 0.8 | **Show a clear warning, but still allow playback** |

Per your instruction: a warning, never a block. The user decides.

In practice it rarely fires — Telegram's 2 GB cap means a 2-hour film averages ~2.4 Mbps,
and a 20-minute 4K clip tops out near 29 Mbps.

---

## 7. Pairing flow

```
TV                                    Phone
 │  LAN scan (1 s, invisible)           │
 ├─ GET /api/ping ─────────────────────►│
 │◄─ {service, device, pairing:open} ───┤
 │                                      │
 ├─ POST /api/pair/request ────────────►│
 │◄─ {code:"7F2K9Q", expiresAt:...} ────┤
 │                                      │
 │  renders QR:                         │
 │  arctv://pair?v=1&h=192.168.0.42     │
 │    &p=8080&c=7F2K9Q&n=Pixel%208      │
 │                                      │
 │                              [user scans]
 │                                      │
 │                                      │  confirms "Allow TV?"
 │◄─ GET /api/pair/status?c=7F2K9Q ─────┤  (polled every 2 s)
 │   {state:"approved", token:"..."} ───┤
 │                                      │
 ├─ GET /api/library (token) ──────────►│
```

Why the scan happens first: a QR drawn by the TV can only contain what the TV already knows,
and the TV is the party that needs the phone's address. The scan therefore carries the
*discovered* address plus the pairing code — the scan itself is the approval.

**Fallback** if the camera won't cooperate: the TV shows the 6-character code large, and you
type it into the phone's "Connect a TV" screen. Same approval endpoint.

Pairing codes expire after 2 minutes. Tokens are long-lived and revocable from the phone.

---

## 8. TV user interface

### 8.1 Screens

1. **Pairing** — QR + code + "looking for Arc Player…" state.
2. **Library** — poster grid, 6 columns, focus ring, smooth scroll, lazy image load.
3. **Detail** — backdrop, title, duration, audio badge, Play button, resume indicator.
4. **Player** — AVPlay surface + overlay (progress bar, title, time, ±10 s, subtitle/audio).

### 8.2 Remote handling

| Key | Code | Action |
|---|---|---|
| Arrows | 37–40 | Move focus |
| Enter / OK | 13 | Select |
| Back / Return | 10009 | Up one level; at root, exit |
| Play / Pause | 415 / 19 | Toggle playback |
| FF / RW | 417 / 412 | ±10 s |
| Stop | 413 | Stop playback |

Media keys require `tizen.tvinputdevice.registerKey()` on TV profile.

### 8.3 AVPlay specifics

- Player element: `<object id="av-player" type="application/avplayer">`.
- `setDisplayRect(0, 0, 1920, 1080)` — Tizen uses a fixed 1920×1080 coordinate space
  regardless of panel resolution.
- Overlay is a DOM layer above the object; auto-hides after 4 s of no input.
- `setExternalSubtitlePath()` for SRT; `getTotalTrackInfo()` / `setSelectTrack()` for audio.

---

## 9. Milestones

> **Split of work.** M0–M2, plus M6's audio conversion, are **phone-side** — implemented by
> the project owner in Antigravity, guided by [`PHONE-SIDE.md`](PHONE-SIDE.md). M3–M5 and M7
> are **TV-side** and are what this workspace delivers. Numbering is kept aligned so both
> halves can be tracked against the same list.

### M0 — Scaffold · done

- Fork Arc Player into `android/`, rename `applicationId`, add NanoHTTPD. **Abandoned** when
  the phone side moved to Antigravity; the five server files were extracted to `handoff/`
  and the fork was deleted.
- `tizen/` skeleton created: `config.xml`, discovery, status screen.
- Reference server compiled and its 20 Range tests passed before handoff.

**Done when:** the handoff bundle compiles inside the phone repo. Verified in the fork prior
to deletion (AGP 8.9.2, Kotlin 2.0.21, `assembleDebug` green).

---

### M1 — Range server over a **static local file** · 2 days

Deliberately Telegram-free: isolates the riskiest unknown (HTTP Range) from the proven one
(TDLib).

- `LocalStreamServer` + `RangeStream` against a file on `/sdcard`.
- `/api/ping`, `HEAD /stream/{id}`, `GET /stream/{id}` with `Range`.
- Token check, CORS, 2-connection cap.

**Done when:**

```powershell
curl -i "http://<phone>:8080/api/ping"
curl -I "http://<phone>:8080/stream/1?k=TOKEN"
curl -i -H "Range: bytes=1048576-2097151" "http://<phone>:8080/stream/1?k=TOKEN"
```

…and VLC on the laptop plays, seeks both directions, and reports the right duration.

---

### M2 — Wire to the Telegram growing file · 3 days

- `stableId` → `CloudVideoItem` via `loadVideos(movie_folder_chat_id)`.
- `localPathFor(video)` → `RangeStream`.
- `advanceWindow` per request; `breakOffFetch` on large jumps.
- Stall + pre-buffer policy from §6.3–6.4.

**Done when:** VLC plays a real Telegram movie start to finish; seeking to 90 % takes under
~8 s and resumes cleanly. Tested on three files, one MKV/HEVC.

---

### M3 — Discovery + QR pairing · 2 days

- `PairingApi` on the phone, `PairingScannerScreen` in the app.
- `discovery.js` + `pairing.js` on the TV, QR rendering, polling, numeric fallback.
- Token persistence in `localStorage`.

**Done when:** a fresh TV install pairs by scanning one QR and lands on the library screen.

---

### M4 — Library UI · 3 days

- `focus.js`: arrow navigation, scroll, debounce, focus memory.
- `library.js`: grid, lazy posters, resume badges.
- `detail.js`: metadata + Play.

**Done when:** the whole shelf is browsable with the remote alone, posters load as you scroll,
and opening a title shows correct metadata.

---

### M5 — Player · 3 days

- `player.js`: AVPlay open → prepare → play, error surface.
- Overlay controls, auto-hide, seek, ±10 s.
- `progress.js`: periodic POST, resume on open.

**Done when:** a film plays from the TV remote, seeking works, and closing then reopening
resumes at the right second.

---

### M6 — Audio, subtitles, bitrate gate · 2 days

- Subtitle fetch + `setExternalSubtitlePath`.
- Audio track list + selection.
- `RemuxGate` + "Prepare for TV" flow (if option B is chosen).
- Bitrate warning dialog (§6.7).

**Done when:** a subtitled film plays with selectable tracks, and a DTS title either converts
or warns clearly.

---

### M7 — Hardening · 1.5 days

- 2-hour soak: leaks, dropped connections, thermal notes.
- Wi-Fi drop / phone lock / TV standby / app backgrounding.
- FGS 6-hour cap behaviour and user notice.
- Build + install + troubleshooting README.

**Done when:** a full film plays uninterrupted and every §11 failure mode has documented,
tested behaviour.

---

## 10. Testing

| Layer | Method |
|---|---|
| Ported logic | The four copied unit tests run unchanged in the fork |
| Range correctness | `curl` matrix: no range, `0-`, `0-0`, mid-file, open-ended, beyond EOF, multi-range |
| Throughput | `curl -w` over LAN with a 1 GB file; assert > 60 Mbps |
| Player compatibility | VLC on laptop as an AVPlay stand-in before touching the TV |
| On-device | Tizen Studio Web Inspector + `sdb shell dlog` |
| Regression | Scripted `curl` suite before each milestone |

---

## 11. Risks

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| 1 | AVPlay times out before Telegram's first bytes | M | H | §6.4 pre-buffer; headers first |
| 2 | DTS audio → silence | H | M | §6.6 conversion decided; video copied, audio → AC-3 |
| 3 | Wi-Fi airtime contention | M | L | §6.7 gate; warn, never block |
| 4 | Phone thermal throttling in a long session | M | M | Screen off; measure in M7 |
| 5 | Android 15 `dataSync` FGS 6 h cap | M | M | Detect + notify; spike `connectedDevice` |
| 6 | AVPlay cannot send custom headers | **H** | M | Token in the **query string** |
| 7 | Tizen `file://` origin + CORS | M | M | `Access-Control-Allow-Origin: *`; verify in M3 |
| 8 | Concurrent range requests fighting | M | M | Latest-wins cancellation per `stableId` |
| 9 | Telegram flood limits on rapid seeking | M | M | Debounce re-aims 250 ms |
| 10 | Focus engine jank on M76 | M | M | CSS transforms only; no layout thrash |
| 11 | Phone IP changes on DHCP | M | L | Discovery scan each launch; DHCP reservation |

---

## 12. Open decisions

1. **Fork identity** — keep `com.aeswox.arctv` so both apps coexist, or replace the original
   once stable?
2. **DHCP reservation** — deferred; you'll ask later.
3. **Tizen Studio** — not installed yet. Needed from M3 onward (~2 GB download).

---

## 13. Effort

| Milestone | Days |
|---|---|
| M0 Scaffold + fork | 1 |
| M1 Range over static file | 2 |
| M2 Telegram growing file | 3 |
| M3 Discovery + QR pairing | 2 |
| M4 Library UI | 3 |
| M5 Player | 3 |
| M6 Audio / subs / bitrate | 2 |
| M7 Hardening | 1.5 |
| **Total** | **17.5** |

≈ 3.5 weeks part-time. Higher than the earlier 13 days because the TV now carries a real
interface instead of a 200-line shell.

M1 remains the go/no-go gate: if Range over a static file doesn't behave, the approach needs
rethinking — better on day 3 than day 15.

---

## 14. Day-1 checklist

1. Answer the DTS question (§12.1).
2. Fork Arc Player into `android/`, rename `applicationId`.
3. Add NanoHTTPD; wire `TvServerConfig` to `arc_player_prefs`.
4. Stand up `/api/ping` on port 8080.
5. `curl` it from the laptop over LAN.
