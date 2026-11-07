# Android TV

A third client for the same phone. `android-tv/` is a Kotlin + Compose application — not a WebView
around `tizen/` — that speaks protocol v2 the way `tizen/js/api.js` does and needed no change on the
phone to be served.

## Why a native half

A Shield, a Google TV set or a Sony with Android TV inside cannot run a Tizen `.wgt` or a webOS
`.ipk`. Nothing about ArcTV's job is platform-specific though: it is HTTP over the LAN with a Range
header, plus a hardware decoder. Android TV has both natively, so the native client is the same
contract and the same interface, rebuilt on the platform's own focus engine and media stack.

The interface is a **port of the web shell's**, screen for screen — pairing, shelf, title page,
player — with its wording, its palette, its geometry and its key engine. Where the two disagree,
the web shell is right and the Kotlin is wrong.

## One contract, three packages

| Package | Built from | Signed by |
|---|---|---|
| `tizen/Debug/tizen.wgt` | `tizen/` | the Tizen CLI's developer certificate |
| `webos/Debug/com.aeswox.arcplayer.tv_*_all.ipk` | `tizen/`, staged by `webos/package.cjs` | nobody — Dev Mode is the trust decision |
| `android-tv/app/build/outputs/apk/` | `android-tv/` | the debug key |

All three carry the **same version number**, read from the `widget` tag of `tizen/config.xml`.
`android-tv/app/build.gradle.kts` parses that file rather than keeping its own number, and derives
`versionCode` from the same three components (`0.3.0` → `300`) so an upgrade is always an upgrade.

## The conversion rule: CSS px ÷ 2 = dp

The web shell draws on a fixed 1920×1080 stage that `js/fit.js` scales to the panel. The emulator
this client was developed against is set to `wm size 1920x1080` **and** `wm density 320`, so one CSS
px is one device px, and one dp is two of them. Every number in the Kotlin is therefore half a number
in `tizen/css/app.css`:

| In `app.css` | In `PlayerScreen.kt` |
|---|---|
| `#player-bottom { padding: 150px 84px 56px }` | `padding(start = 42.dp, end = 42.dp, top = 75.dp, bottom = 28.dp)` |
| `.player-control { 84×84px; margin-right: 18px }` | `size(42.dp)`, `Arrangement.spacedBy(9.dp)` |
| `.player-sheet { bottom: 240px; width: 980px; max-height: 520px; padding: 34px 38px; border-radius: 28px }` | `padding(bottom = 120.dp)`, `widthIn(max = 490.dp)`, `heightIn(max = 260.dp)`, `padding(horizontal = 19.dp, vertical = 17.dp)`, `RoundedCornerShape(14.dp)` |

The rule is exact only at density 320. Nothing in the Kotlin rescales for the window — the dp values
are fixed, and the three `LocalDensity` reads in the tree are `toPx` conversions for animation lifts,
not a scale factor. So a set reporting a different density draws the same layout proportionally
larger or smaller, and a set whose window is not 1920×1080 shows a different amount of it. Android's
own guidance for apps targeting API 31 and up is that they are expected to handle window sizes
greater than 1080p, so this is a real question rather than a theoretical one — and no physical set
has answered it yet.

## The key engine, ported

`PlayerScreen.kt` reimplements `tizen/js/player.js` rather than delegating to Compose's focus
system, because the reference's engine is not the platform's: the control row is a **virtual** list.
Nothing in it is focusable — the pills answer taps through `arcTap`, which is pointer-only, so a
D-pad move never lands on one of them and Compose's traversal cannot interfere. `focusIndex` is a
plain state int, and `handleKey` reads raw `nativeKeyCode`s in an `onPreviewKeyEvent`.

The rules, all of them measured against the shell:

- **Any key wakes the chrome.** Four seconds of nothing — `HIDE_CONTROLS_MS` in `player.js`,
  `HideControlsMs` here — and it hides *and clears control focus*. That clearing is the reason a
  LEFT or RIGHT after a pause is a seek and not a move along the row.
- **The timeout never runs while a sheet is up** or while the picture is waiting on bytes, so a
  track list cannot vanish mid-read.
- **LEFT/RIGHT on the row wrap modulo** (`player.js:408`): from the first pill, LEFT lands on the
  last one.
- **OK on a pill opens its sheet — unless it is empty.** An empty list never opens a sheet; it only
  replaces the hint with `No embedded subtitles found` or `No audio tracks found`.
- **BACK closes a sheet and hands focus back to the pill that opened it.** BACK with no sheet open
  leaves the film. The sheet's own note says `Use the remote to choose · Back closes`, so this is a
  promise the interface makes out loud.
- **The hint line names the focused pill** — except the aspect pill, which names the mode it is
  currently in (`Fit to screen`, `Stretch`, `Crop to fit`), because that is the thing the viewer
  needs to know before pressing.
- **Unhandled keys are handed back** (`return false`), so volume, guide and a set's own shortcuts
  still reach the television. The web shell swallows everything because one `document` listener
  serves the whole app; here this screen is the only thing alive.

`Previous` and `Next` appear only when the part has a neighbour, which is what makes the row five
long inside a series and three long for a film.

Seek steps are the reference's: 10 s for an arrow, 30 s for rewind and fast-forward.

## Building

```powershell
cd android-tv
.\gradlew.bat :app:assembleDebug
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

The manifest registers `LEANBACK_LAUNCHER` and no `LAUNCHER` — correct for a television, but it
means the app has no icon in a phone-style launcher:

```powershell
adb shell am start -n com.aeswox.arcplayer.tv/.MainActivity
```

It does have a tile on the television's own home screen: the manifest declares `android:banner`, a
640×360 `res/drawable-nodpi/banner.png`, beside an `android:icon` that is `tizen/icon.png` copied
byte for byte — the same clapperboard all three packages wear. `tools/icon/render-android-art.ps1`
rasterises both through headless Chrome, the path `render.ps1` already uses for the panel icon.

`minSdk` is 31 — Android 12, and the same floor the phone app ships, so the two halves install on the
same Android versions. A set still on Android 11 (API 30) cannot run it. `usesCleartextTraffic` is on
because the phone is a LAN endpoint with no hostname and cannot offer a certificate a television
would accept; pairing is what stands in for transport security instead of TLS.

## The emulator rig

These are the facts that made development possible, all of them learned the hard way:

- **`-gpu host` is required.** With `swiftshader_indirect` the shelf crawls and the player cannot be
  judged at all.
- `wm size 1920x1080` and `wm density 320`, so the CSS px ÷ 2 rule holds and a screenshot is a
  one-to-one map of the web shell's stage.
- **The guest reaches the host machine at `10.0.2.2`.** The mock phone listens on the LAN, so the
  address typed into the pairing pad is the machine's own LAN address.
- The mock phone runs with `TOKEN=… AUTO_APPROVE=1 node tools/mock-server/server.js` (pin any token), so
  a device that already has the token gets straight to the shelf and one that does not is approved
  without a human pressing Allow.
- **In Git Bash, `export MSYS2_ARG_CONV_EXCL="*"` before any command that mentions `/sdcard`** —
  otherwise MSYS rewrites it to a Windows path and `uiautomator dump` writes somewhere else entirely.
- D-pad keycodes, because getting these wrong once cost an hour: **19 UP, 20 DOWN, 21 LEFT, 22
  RIGHT, 23 CENTER, 4 BACK**.

## Measuring it

`uiautomator` sees the pairing, shelf and title screens as ordinary nodes. **It sees nothing of the
player chrome** — a dump taken while the control row, the hint and the seek bar are all visibly on
screen returns a tree with zero text nodes. So the player is measured in pixels:

```bash
adb exec-out screencap -p > f.png
ffmpeg -y -i f.png -f rawvideo -pix_fmt rgb24 f.raw
node -e 'const[,f,x0,x1,y0,y1]=process.argv,b=require("fs").readFileSync(f);let s=0,n=0,m=0;
for(let y=+y0;y<=+y1;y++)for(let x=+x0;x<=+x1;x++){const i=(y*1920+x)*3,
l=b[i]*.299+b[i+1]*.587+b[i+2]*.114;s+=l;n++;if(l>m)m=l}
console.log({mean:+(s/n).toFixed(1),max:+m.toFixed(0)})' f.raw 84 168 940 1023
```

The width is hardcoded to the rig's 1920. With the control row at `padding: 150px 84px 56px` and
84 px pills on an 18 px gap, the row occupies y 940–1023 and the three boxes of a film's row are
x 84–168 (aspect), 186–270 (subtitles) and 288–372 (audio).

What the numbers mean, and the traps in reading them:

- A focused pill is a white disc: mean luma ≈ 184 over its 84×84 box. An unfocused pill over the
  test film sits at 19–37 depending on which colour bar is behind it.
- **A focused *disabled* pill is white at alpha 0.34** — mean ≈ 71, max ≈ 95. A threshold that looks
  for "near-white" (>235) does not see it at all, which is how a dimmed Subtitles pill read as
  unfocused for a whole session. Measure the mean, not the max.
- `screencap` takes about 0.5 s, but **the app can take seconds to process a key** — the system
  logs it (`InputDispatcher: … spent 2772ms processing KeyEvent`). Wait ~1.2 s after injecting
  before capturing, and keep the whole walk inside one shell command so the 4 s auto-hide does not
  fire between tool calls.
- **`screenrecord` on this emulator records the app window but not the video surface**: the film
  comes out black while the chrome is captured normally. Useful for chrome, useless for picture,
  which is why `screencap` is the tool.
- The mock film has its timecode burned into the top-left corner. It is the only honest oracle for
  whether the play head actually moved — and for whether the film is paused (two captures with an
  identical timecode are one held frame).

With the mock clip the player walk is: DOWN → the first pill fills and the hint reads `Fit to
screen`; RIGHT → the Subtitles pill, dimmed because this clip carries no embedded text track; OK →
the hint becomes `No embedded subtitles found` and **no sheet opens**; RIGHT → Audio; OK → the
`Audio track` sheet with one row, `UND · AAC · 128 kbps · 1 ch`; BACK → the sheet closes, the film
keeps playing and the Audio pill is focused again; OK inside the sheet → the hint reads
`Audio: UND` and focus returns to the same pill.

## What has not been seen

- **No physical Android TV set has ever run this.** Everything above was measured on the emulator.
  The remote's key repeat, the panel's own volume overlay, HDMI audio passthrough and the decoder's
  container tolerance are all still questions.
- **Captions from the shelf are not wired on either TV client.** The phone serves
  `/api/subtitles/{id}`, and neither `android-tv` nor the web shell calls it — the shell's
  `subtitlesUrl` in `api.js` has no call sites either. Both offer embedded tracks only, so this is
  faithful rather than broken, but it is not finished.
- **The mock phone serves one shared clip for every id.** `handleStream` in `tools/mock-server/server.js`
  ignores the id and ranges over the single file in `media/`, so whichever card is opened, the bytes
  are `sample.mp4`: 120 s, one h264 video stream and one single-channel AAC audio stream, both `und`,
  and no text stream at all (ffprobe). The sheet's row-to-row movement is therefore only proven by
  code reading, not by a sighting. Dropping a multi-track file into `media/` would settle it in one
  walk — and would also make the Subtitles pill enabled for the first time.
- 4K, HDR and the codecs a real panel chokes on: untested. `docs/PHONE-SIDE.md` covers what the
  phone does about DTS and TrueHD, which is to warn and to convert nothing.
