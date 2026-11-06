# ArcTV on LG webOS

The same app, packaged twice. `tizen/` holds the only sources — HTML, CSS and the twelve ES5
modules — and `webos/` holds nothing but an LG manifest and a script that assembles those sources
into an `.ipk`. There is no second copy of the interface to keep in step, and the version in
`webos/appinfo.json` is stamped from `tizen/config.xml` at build time, so the two packages can
never claim different numbers.

---

## 1. What actually differs between the panels

| | Samsung (Tizen 6) | LG (webOS 5–7) |
|---|---|---|
| Back button | `10009` | `461` |
| D-pad, Enter | `37 38 39 40 13` | identical |
| Play/pause, rewind, forward, stop | `415`/`19`/`10252`, `412`, `417`, `413` | identical |
| Media keys | must be registered with `tizen.tvinputdevice` | delivered to every web app |
| Video surface | `webapis.avplay` — hardware, any container it knows | `<video>` only |
| Track switching | `getTotalTrackInfo()` + `setSelectTrack()` | not available to a web app |
| Model name for the phone prompt | `productinfo.getModelName()` | no API — reports `LG webOS TV` |
| Remote debugging | blocked in developer mode | `ares-inspect` attaches devtools |

Every one of those is answered in `tizen/js/platform.js`, which is the only file in the app that
knows there is more than one television. `player.js` already chose its backend by looking for
`webapis.avplay`, so webOS falls onto the `<video>` path with no new code — the same path the
desktop preview has always used.

Back is the one key with different numbers, and both are accepted wherever back is tested:

```js
var BACK_KEYS = [10009, 461, 27];   // Samsung, LG, and the keyboard in the preview
```

No panel sends `27`; it stays so the preview can be driven from a laptop.

To look at this half without an LG in the room, the desktop preview can borrow its identity:

```powershell
node tools\static.js 8081 tizen
# then open http://localhost:8081/?host=127.0.0.1&platform=webos
```

`platform=webos` forces `Platform.kind`, so the pairing request the phone sees reads *LG webOS TV*
and `perf.js` stamps the LG name on every measurement. It renames the television and changes nothing
else — the player still picks its backend by finding `avplay`, which a browser does not have, so the
preview and an actual LG panel take the same `<video>` path. Escape is Back.

---

## 2. Building the package

[`ares-cli`](https://webostv.developer.lge.com/develop/getting-started/ares-cli) is the only tool
needed — no IDE, no LG SDK, no sign-up:

```powershell
npm install -g ares-cli        # once
node webos\package.cjs         # → webos\Debug\com.aeswox.arcplayer.tv_<version>_all.ipk (~42 KB)
```

The script stages `webos/.build` (index.html, css, js, icon.png, appinfo.json) and hands it to
`ares-package`, which writes the usual opkg archive. `--no-package` stops after staging, which is
what the LG IDE's import wants. The result contains exactly the files a TV needs — nothing from
`config.xml`, nothing from the Tizen build directory.

## 3. Installing on a television

webOS sideloading goes through the **Dev Mode** app from the LG Content Store, which is a much
friendlier path than Tizen's: sign in with an LG account, switch on *Home Daemon*, and the TV
listens for ares on port 3000 with an eight-character passphrase on screen.

```powershell
ares-setup-device -a lgtv -i '{
  "host":"<tv-ip>", "port":"3000", "username":"developer",
  "password":"<passphrase on the Dev Mode screen>", "default": true }'

ares-device -d lgtv -i                 # confirms the key exchange
ares-install webos\Debug\com.aeswox.arcplayer.tv_<version>_all.ipk
ares-launch com.aeswox.arcplayer.tv
```

The Dev Mode app has to stay open on the TV for installs, and a power cycle clears the pairing —
re-run `ares-setup-device` with a fresh passphrase rather than debug from a stale one. Once the app
is running, `ares-inspect -a com.aeswox.arcplayer.tv` opens Chrome devtools against it, so a frame
trace on an LG is possible in a way it never was on the Samsung.

Nothing on the phone changes. It already answers with `Access-Control-Allow-Origin: *`, which is
the only reason a webOS origin can talk to port 8080 at all.

---

## 4. What webOS gives up

These are consequences of the platform, not of this port, and a viewer on an LG should know them
before sitting down:

- **`<video>` decides what plays.** H.264/AAC MP4 and HLS are safe. A Matroska `.mkv` is the
  common case in this library and whether the panel's demuxer accepts one has to be seen on the
  set — the browser preview answers "probably", which is not evidence.
- **No track switching.** The audio and subtitle sheets stay in the interface and report
  *No audio tracks found* / *No embedded subtitles found*, because a webOS web app cannot enumerate
  the tracks inside a stream. On Samsung the same sheets work through AVPlay.
- **DTS and TrueHD are silent.** The phone names the codec from the file name and the TV page
  warns before playback; nothing converts, on either platform.
- **1080p is the honest ceiling for the preview path**; a 4K film plays at whatever the panel's
  decoder decides, with no `setDisplayRect` or display-mode control to argue with.
- **`#av-player` logs one error on load.** The Tizen `<object type="application/avplayer">` is
  inert on webOS and is hidden by the player before it is ever needed; leaving it in the DOM is
  what keeps the Samsung path working.

## 5. Proven here, and what has not been

Checked in a headless browser against the mock phone, with an LG user agent and a stubbed
`window.tizen`:

- [x] a stubbed Tizen still registers all six media keys, and reports `platform: tizen`
- [x] `461` and `10009` both leave a film page for the shelf and both close the player
- [x] an LG user agent reads as webOS and tells the phone `LG webOS TV` at pairing
- [x] playback on webOS lands on the `<video>` surface and the position advances in real time
- [x] the `.ipk` carries the twelve modules, the stylesheet and the page — and only those
- [ ] nothing has been seen on a physical LG panel, which is the only place the codec question
      in §4 has an answer
