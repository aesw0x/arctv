# M1 — Validating the Range server

The point of M1 is to prove the HTTP layer *before* Telegram is involved. If these checks pass,
the riskiest unknown in the whole project is gone.

---

## 1. Install the forked app

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb devices
& $adb install -r app\build\outputs\apk\debug\app-debug.apk   # built from the Arc Player repository
```

Launch it once. The server starts with the app (`ArcPlayerApplication`), so a notification
reading **"ArcTV is serving your library"** should appear.

Find the phone's address:

```powershell
& $adb shell ip route
```

## 2. Give it something to stream

The server looks for a demo file in this order:

1. `tv_server_demo_file` in `arc_player_prefs` (absolute path)
2. `demo.mkv`, `demo.mp4`, `demo.ts` in the app's external files directory

The easy path is #2:

```powershell
& $adb push "D:\some\film.mkv" /sdcard/Android/data/com.aeswox.arctv/files/demo.mkv
```

Then restart the app so the service re-registers the source.

> If the demo source does not appear, check `adb logcat -s ArcTV-Service` — it logs
> `demo source: … (N bytes)` on registration and `demo file missing: …` when the path is wrong.

## 3. Read the token

```powershell
& $adb shell run-as com.aeswox.arctv cat shared_prefs/arc_player_prefs.xml
```

Look for `tv_server_token`. Every request below needs it.

---

## 4. The checks

Set two variables first:

```powershell
$phone = "192.168.0.42"      # from step 1
$token = "…"                 # from step 3
$base  = "http://${phone}:8080"
```

### 4.1 Ping — no auth, CORS headers present

```powershell
curl.exe -i "$base/api/ping"
```

Expect `200`, `Access-Control-Allow-Origin: *`, and:

```json
{"service":"arcplayer","version":1,"device":"…","pairing":"open"}
```

### 4.2 Auth is actually enforced

```powershell
curl.exe -i "$base/stream/demo"              # expect 401
curl.exe -i "$base/stream/demo?k=wrong"      # expect 401
```

### 4.3 HEAD advertises the full size

```powershell
curl.exe -I "$base/stream/demo?k=$token"
```

Expect `Content-Length` equal to the real file size and `Accept-Ranges: bytes`.

### 4.4 The range matrix

| Request | Expected |
|---|---|
| `Range: bytes=0-` | `206`, `Content-Range: bytes 0-<size-1>/<size>` |
| `Range: bytes=0-0` | `206`, exactly 1 byte |
| `Range: bytes=1048576-2097151` | `206`, exactly 1048576 bytes |
| `Range: bytes=1048576-` | `206`, `size-1048576` bytes |
| `Range: bytes=-1024` | `206`, last 1024 bytes |
| `Range: bytes=999999999999-` | `416`, `Content-Range: bytes */<size>` |
| `Range: bytes=0-99,200-299` | `416` (multi-range deliberately rejected) |
| no `Range` | `200`, whole file |

```powershell
curl.exe -i -H "Range: bytes=0-0" "$base/stream/demo?k=$token"
curl.exe -i -H "Range: bytes=1048576-2097151" -o chunk.bin -D - "$base/stream/demo?k=$token"
(Get-Item chunk.bin).Length            # must be exactly 1048576
```

### 4.5 Byte-exactness

A range response must be the *same bytes* as that slice of the original file, not just the same
length:

```powershell
curl.exe -s -H "Range: bytes=1000000-1099999" "$base/stream/demo?k=$token" -o slice.bin
$orig = [System.IO.File]::ReadAllBytes("D:\some\film.mkv")
$got  = [System.IO.File]::ReadAllBytes("slice.bin")
$match = $true
for ($i = 0; $i -lt 100000; $i++) { if ($orig[1000000 + $i] -ne $got[$i]) { $match = $false; break } }
"byte-exact: $match"
```

### 4.6 Throughput

```powershell
curl.exe -o NUL -w "size=%{size_download} time=%{time_total}s speed=%{speed_download} B/s`n" `
  "$base/stream/demo?k=$token"
```

Over Wi-Fi 5, expect **> 60 Mbps** (7.5 MB/s). Below that, the 1080p streaming plan is at risk.

### 4.7 A real player

VLC on the laptop, as an AVPlay stand-in:

```
Media → Open Network Stream → http://<phone>:8080/stream/demo?k=<token>
```

Then:

- the film must report the correct **duration** (proves `Content-Length` is honest),
- dragging the scrub bar forward and backward must resume within a second or two (proves 206),
- `Tools → Codec Information` should show the right container.

---

## 5. Pass criteria

M1 is done when every row of §4 passes, VLC seeks cleanly in both directions, and the byte-exact
check is `True`.

Anything failing here is a bug in our code. Anything failing *after* M2 — where Telegram starts
feeding the file — is a bug in the window logic, and the two are much easier to tell apart because
this suite already proves the transport.
