/*
 * Playback.
 *
 * On the TV this is AVPlay and nothing else — it is the only path to 4K on this panel. In a
 * desktop browser `webapis.avplay` does not exist, so the same controls drive a plain <video>
 * element instead. That fallback exists so the interface can be built and tested without a TV;
 * it is never used on the device.
 */
(function (global) {
    'use strict';

    var HIDE_CONTROLS_MS = 4000;
    var REPORT_MS = 10000;
    var SEEK_STEP_MS = 10000;
    var LARGE_STEP_MS = 30000;

    var DISPLAY_MODES = [
        { label: 'Fit to screen', icon: 'fit', value: 'PLAYER_DISPLAY_MODE_LETTER_BOX', html: 'contain' },
        { label: 'Stretch', icon: 'stretch', value: 'PLAYER_DISPLAY_MODE_STRETCH', html: 'fill' },
        { label: 'Crop to fit', icon: 'crop', value: 'PLAYER_DISPLAY_MODE_FULL_SCREEN', html: 'cover' }
    ];

    /*
     * The three glyphs are the phone player's own icons, lifted from HugeIcons.kt path for path so
     * the two apps read as one product. `currentColor` lets the focused button flip the stroke from
     * white to black without a second copy of the markup.
     */
    var ICONS = (function () {
        function svg(paths) {
            return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                paths + '</svg>';
        }

        return {
            fit: svg(
                '<path stroke-linecap="round" stroke-linejoin="round" d="M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z"/>' +
                '<path stroke-linecap="round" stroke-linejoin="round" d="M12.9833 11.0167C12.4085 10.4419 12.5041 8 12.5041 8M12.9833 11.0167C13.5581 11.5915 16 11.4958 16 11.4958M12.9833 11.0167L17 7M11.0131 12.9868C10.4383 12.412 7.99641 12.5077 7.99641 12.5077M11.0131 12.9868C11.5879 13.5616 11.4922 16.0035 11.4922 16.0035M11.0131 12.9868L7 16.9999"/>'
            ),
            stretch: svg(
                '<path stroke-linecap="round" stroke-linejoin="round" d="M16.5148 16.5149C17.0896 15.9401 16.9941 13.4982 16.9941 13.4982M16.5148 16.5149C15.94 17.0897 13.4981 16.994 13.4981 16.994M16.5148 16.5149L13 13M7.48506 7.48512C8.05987 6.91031 10.5018 7.00596 10.5018 7.00596M7.48506 7.48512C6.91025 8.05993 7.00598 10.5018 7.00598 10.5018M7.48506 7.48512L11 11"/>' +
                '<path stroke-linecap="round" stroke-linejoin="round" d="M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z"/>'
            ),
            crop: svg(
                '<path stroke-linecap="round" d="M10.4922 3.00391C7.22965 3.02207 5.46278 3.16674 4.31021 4.31932C2.99219 5.63734 2.99219 7.75866 2.99219 12.0013C2.99219 16.2439 2.99219 18.3653 4.31021 19.6833C5.62823 21.0013 7.74955 21.0013 11.9922 21.0013C16.2348 21.0013 18.3561 21.0013 19.6742 19.6833C20.8267 18.5307 20.9714 16.7638 20.9896 13.5013"/>' +
                '<path stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="M10.9922 13.0002L20.3421 3.64962M20.8861 9.00098L20.5795 3.41364L14.9922 3.10712"/>'
            ),
            subtitles: svg(
                '<path stroke-linejoin="round" d="M14.1706 20.8905C18.3536 20.6125 21.6856 17.2332 21.9598 12.9909C22.0134 12.1607 22.0134 11.3009 21.9598 10.4707C21.6856 6.22838 18.3536 2.84913 14.1706 2.57107C12.7435 2.47621 11.2536 2.47641 9.8294 2.57107C5.64639 2.84913 2.31441 6.22838 2.04024 10.4707C1.98659 11.3009 1.98659 12.1607 2.04024 12.9909C2.1401 14.536 2.82343 15.9666 3.62791 17.1746C4.09501 18.0203 3.78674 19.0758 3.30021 19.9978C2.94941 20.6626 2.77401 20.995 2.91484 21.2351C3.05568 21.4752 3.37026 21.4829 3.99943 21.4982C5.24367 21.5285 6.08268 21.1757 6.74868 20.6846C7.1264 20.4061 7.31527 20.2668 7.44544 20.2508C7.5756 20.2348 7.83177 20.3403 8.34401 20.5513C8.8044 20.7409 9.33896 20.8579 9.8294 20.8905"/>' +
                '<path stroke-linecap="round" d="M15 16H17M7 16H12"/>' +
                '<path stroke-linecap="round" d="M16 13H17M11 13H13M7 13H8"/>'
            ),
            audio: svg(
                '<path stroke-linecap="round" d="M20.5 13.5V10.5C20.5 6.74142 20.5 4.86213 19.4472 3.60746C19.2788 3.40678 19.0932 3.22119 18.8925 3.0528C17.6379 2 15.7586 2 12 2C8.24142 2 6.36213 2 5.10746 3.0528C4.90678 3.22119 4.72119 3.40678 4.5528 3.60746C3.5 4.86213 3.5 6.74142 3.5 10.5V13.5C3.5 17.2586 3.5 19.1379 4.5528 20.3925C4.72119 20.5932 4.90678 20.7788 5.10746 20.9472C6.36213 22 8.24142 22 12 22C15.7586 22 17.6379 22 18.8925 20.9472C19.0932 20.7788 19.2788 20.5932 19.4472 20.3925C20.5 19.1379 20.5 17.2586 20.5 13.5Z"/>' +
                '<path d="M15.5 15C15.5 16.933 13.933 18.5 12 18.5C10.067 18.5 8.5 16.933 8.5 15C8.5 13.067 10.067 11.5 12 11.5C13.933 11.5 15.5 13.067 15.5 15Z"/>' +
                '<path d="M13.5 7C13.5 7.82843 12.8284 8.5 12 8.5C11.1716 8.5 10.5 7.82843 10.5 7C10.5 6.17157 11.1716 5.5 12 5.5C12.8284 5.5 13.5 6.17157 13.5 7Z"/>'
            )
        };
    })();

    var layer = null;
    var avObject = null;
    var video = null;
    var overlay = null;
    var titleEl = null;
    var posEl = null;
    var durEl = null;
    var fillEl = null;
    var hintEl = null;
    var controlsEl = null;
    var sheetEl = null;
    var sheetTitleEl = null;
    var sheetOptionsEl = null;

    var ctx = null;
    var mode = null;
    var active = false;

    var tickTimer = null;
    var reportTimer = null;
    var hideTimer = null;
    var lastReported = -1;

    var controlItems = [];
    var focusIndex = -1;

    var sheetOpen = false;
    var sheetType = null;
    var sheetItems = [];
    var sheetIndex = 0;
    var sheetReturn = -1;

    var audioTracks = [];
    var textTracks = [];
    var displayMode = 0;

    function hasAvplay() {
        return !!(global.webapis && global.webapis.avplay);
    }

    function init() {
        if (layer) { return; }
        layer = document.getElementById('player-layer');
        avObject = document.getElementById('av-player');
        video = document.getElementById('html-player');
        overlay = document.getElementById('player-ui');
        titleEl = document.getElementById('player-title');
        posEl = document.getElementById('player-pos');
        durEl = document.getElementById('player-dur');
        fillEl = document.getElementById('player-fill');
        hintEl = document.getElementById('player-hint');
        controlsEl = document.getElementById('player-controls');
        sheetEl = document.getElementById('player-sheet');
        sheetTitleEl = document.getElementById('player-sheet-title');
        sheetOptionsEl = document.getElementById('player-sheet-options');
        buildControls();
    }

    function isActive() { return active; }

    function setHint(text) { if (hintEl) { hintEl.textContent = text || ''; } }

    function showControls() {
        if (!overlay) { return; }
        overlay.classList.remove('faded');
        if (hideTimer) { clearTimeout(hideTimer); }
        if (sheetOpen) { return; }

        hideTimer = setTimeout(function () {
            if (!active || sheetOpen) { return; }
            overlay.classList.add('faded');
            clearControlFocus();
        }, HIDE_CONTROLS_MS);
    }

    function buildControls() {
        UI.clear(controlsEl);
        controlItems = [];

        var definitions = [
            { name: 'Aspect', icon: DISPLAY_MODES[displayMode].icon, action: cycleDisplayMode, aspect: true },
            { name: 'Subtitles', icon: 'subtitles', track: 'TEXT', action: function () { openSheet('TEXT'); } },
            { name: 'Audio', icon: 'audio', track: 'AUDIO', action: function () { openSheet('AUDIO'); } }
        ];

        for (var i = 0; i < definitions.length; i++) {
            (function (definition) {
                var el = UI.el('div', 'player-control');
                el.innerHTML = ICONS[definition.icon];
                el.setAttribute('aria-label', definition.name);
                el.addEventListener('click', function () {
                    if (active) { definition.action(); }
                });
                controlsEl.appendChild(el);
                controlItems.push({
                    el: el,
                    name: definition.name,
                    track: definition.track,
                    action: definition.action,
                    aspect: !!definition.aspect,
                    iconName: definition.icon
                });
            })(definitions[i]);
        }

        updateControls();
    }

    function setControlFocus(index) {
        if (controlItems.length === 0) { return; }
        if (index < 0) { index = 0; }
        if (index >= controlItems.length) { index = controlItems.length - 1; }
        focusIndex = index;

        for (var i = 0; i < controlItems.length; i++) {
            if (i === focusIndex) { controlItems[i].el.classList.add('focused'); }
            else { controlItems[i].el.classList.remove('focused'); }
        }

        var item = controlItems[focusIndex];
        setHint(item.aspect ? DISPLAY_MODES[displayMode].label : item.name);
        showControls();
    }

    function clearControlFocus() {
        focusIndex = -1;
        for (var i = 0; i < controlItems.length; i++) {
            controlItems[i].el.classList.remove('focused');
        }
    }

    function moveControlFocus(delta) {
        if (focusIndex < 0) { setControlFocus(0); return; }
        var next = (focusIndex + delta + controlItems.length) % controlItems.length;
        setControlFocus(next);
    }

    function activateControl() {
        if (focusIndex < 0 || !controlItems[focusIndex]) { return; }
        controlItems[focusIndex].action();
    }

    function updateControls() {
        for (var i = 0; i < controlItems.length; i++) {
            var item = controlItems[i];

            if (item.aspect) {
                var selected = DISPLAY_MODES[displayMode];
                if (item.iconName !== selected.icon) {
                    item.iconName = selected.icon;
                    item.el.innerHTML = ICONS[selected.icon];
                    item.el.setAttribute('aria-label', selected.label);
                }
            }

            var count = -1;
            if (item.track === 'AUDIO') { count = audioTracks.length; }
            if (item.track === 'TEXT') { count = textTracks.length; }
            if (count >= 0) {
                if (count === 0) { item.el.classList.add('disabled'); }
                else { item.el.classList.remove('disabled'); }
            }
        }
    }

    function parseExtraInfo(value) {
        if (!value) { return {}; }
        if (typeof value === 'object') { return value; }
        try { return JSON.parse(String(value)); } catch (ignored) { return {}; }
    }

    function trackLabel(track, fallback) {
        var info = parseExtraInfo(track.extra_info);
        var language = info.language || info.lang || info.title || info.name;
        if (language) { return String(language).toUpperCase(); }
        return fallback;
    }

    function trackMeta(track) {
        var info = parseExtraInfo(track.extra_info);
        var parts = [];
        if (info.codec) { parts.push(String(info.codec).toUpperCase()); }
        if (info.bitrate) { parts.push(Math.round(Number(info.bitrate) / 1000) + ' kbps'); }
        if (info.channels) { parts.push(String(info.channels) + ' ch'); }
        return parts.join(' · ');
    }

    function refreshTracks() {
        if (!hasAvplay()) {
            audioTracks = [];
            textTracks = [];
            updateControls();
            return false;
        }

        try {
            var total = global.webapis.avplay.getTotalTrackInfo() || [];
            audioTracks = [];
            textTracks = [];

            for (var i = 0; i < total.length; i++) {
                if (total[i].type === 'AUDIO') { audioTracks.push(total[i]); }
                if (total[i].type === 'TEXT') { textTracks.push(total[i]); }
            }

            updateControls();
            return audioTracks.length > 0 || textTracks.length > 0;
        } catch (ignored) {
            return false;
        }
    }

    function currentTrackIndex(type) {
        if (!hasAvplay()) { return -2; }
        try {
            var raw = global.webapis.avplay.getCurrentStreamInfo();
            var list = Object.prototype.toString.call(raw) === '[object Array]' ? raw : [raw];
            for (var i = 0; i < list.length; i++) {
                if (list[i] && list[i].type === type) { return Number(list[i].index); }
            }
        } catch (ignored) { /* not ready yet */ }
        return -2;
    }

    function openSheet(type) {
        refreshTracks();

        if (type === 'AUDIO' && audioTracks.length === 0) {
            setHint('No audio tracks found');
            return;
        }

        if (type === 'TEXT' && textTracks.length === 0) {
            setHint('No embedded subtitles found');
            return;
        }

        sheetOpen = true;
        sheetType = type;
        sheetIndex = 0;
        sheetReturn = focusIndex;
        clearControlFocus();
        sheetEl.classList.remove('hidden');
        renderSheet();
        showControls();
    }

    function closeSheet() {
        if (!sheetOpen) { return; }
        sheetOpen = false;
        sheetType = null;
        sheetItems = [];
        sheetIndex = 0;
        sheetEl.classList.add('hidden');

        if (active && sheetReturn >= 0) {
            setControlFocus(sheetReturn);
        } else {
            showControls();
        }
        sheetReturn = -1;
    }

    function renderSheet() {
        UI.clear(sheetOptionsEl);
        sheetTitleEl.textContent = sheetType === 'AUDIO' ? 'Audio track' : 'Subtitles';

        var current = currentTrackIndex(sheetType);
        sheetItems = [];

        if (sheetType === 'TEXT') {
            sheetItems.push({ index: -1, label: 'Off', meta: current === -1 ? 'Current' : '' });
        }

        var tracks = sheetType === 'AUDIO' ? audioTracks : textTracks;
        for (var i = 0; i < tracks.length; i++) {
            var track = tracks[i];
            var fallback = 'Track ' + (i + 1);
            sheetItems.push({
                index: Number(track.index),
                label: trackLabel(track, fallback),
                meta: current === Number(track.index) ? 'Current' : trackMeta(track)
            });
        }

        if (sheetIndex >= sheetItems.length) { sheetIndex = sheetItems.length - 1; }
        if (sheetIndex < 0) { sheetIndex = 0; }

        for (var optionIndex = 0; optionIndex < sheetItems.length; optionIndex++) {
            (function (option, optionIndex) {
                var row = UI.el('div', 'player-option');
                if (option.meta === 'Current') { row.classList.add('selected'); }

                var label = UI.el('div', 'player-option-label', option.label);
                var meta = UI.el('div', 'player-option-meta', option.meta);
                row.appendChild(label);
                row.appendChild(meta);

                row.addEventListener('click', function () {
                    sheetIndex = optionIndex;
                    selectSheetOption();
                });

                sheetOptionsEl.appendChild(row);
                option.el = row;
            })(sheetItems[optionIndex], optionIndex);
        }

        applySheetFocus();
    }

    function applySheetFocus() {
        for (var i = 0; i < sheetItems.length; i++) {
            if (i === sheetIndex) { sheetItems[i].el.classList.add('focused'); }
            else { sheetItems[i].el.classList.remove('focused'); }
        }
    }

    function moveSheet(delta) {
        if (sheetItems.length === 0) { return; }
        sheetIndex = (sheetIndex + delta + sheetItems.length) % sheetItems.length;
        applySheetFocus();
    }

    function selectSheetOption() {
        var option = sheetItems[sheetIndex];
        if (!option) { return; }

        var message;
        if (hasAvplay()) {
            try {
                global.webapis.avplay.setSelectTrack(sheetType, option.index);
                message = (sheetType === 'AUDIO' ? 'Audio: ' : 'Subtitles: ') + option.label;
            } catch (error) {
                message = 'Could not switch: ' + describe(error);
            }
        } else {
            message = 'Track switching needs the TV player';
        }

        closeSheet();
        setHint(message);
        updateControls();
    }

    function cycleDisplayMode() {
        displayMode = (displayMode + 1) % DISPLAY_MODES.length;
        var selected = DISPLAY_MODES[displayMode];

        if (mode === 'avplay') {
            try { global.webapis.avplay.setDisplayMethod(selected.value); } catch (ignored) { /* ignore */ }
        } else if (video) {
            video.style.objectFit = selected.html;
        }

        setHint(selected.label);
        updateControls();
        showControls();
    }

    function seekBy(delta) {
        seekTo(position() + delta);
    }

    function open(options) {
        init();
        closeSilently();

        ctx = options;
        active = true;
        lastReported = -1;
        audioTracks = [];
        textTracks = [];
        displayMode = 0;
        focusIndex = -1;

        layer.classList.remove('hidden');
        sheetEl.classList.add('hidden');
        titleEl.textContent = options.item.title || '';
        posEl.textContent = '0:00';
        durEl.textContent = '0:00';
        fillEl.style.width = '0%';
        setHint(options.item.source === 'telegram' ? 'Fetching from Telegram through your phone…' : '');
        buildControls();
        showControls();

        var url = ArcTV.streamUrl(options.host, options.item.id);
        var startMs = options.startMs || 0;

        if (hasAvplay()) {
            mode = 'avplay';
            video.classList.add('hidden');
            startAvplay(url, startMs);
        } else {
            mode = 'html';
            avObject.classList.add('hidden');
            startHtml(url, startMs);
        }

        tickTimer = setInterval(tick, 500);
        reportTimer = setInterval(report, REPORT_MS);
    }

    function startAvplay(url, startMs) {
        var av = global.webapis.avplay;

        try { av.close(); } catch (ignored) { /* nothing open */ }

        avObject.classList.remove('hidden');

        try {
            av.open(url);
            av.setDisplayRect(0, 0, 1920, 1080);
            av.setDisplayMethod(DISPLAY_MODES[displayMode].value);
            av.setListener({
                oncurrentplaytime: function () { /* polled by tick */ },
                onstreamcompleted: function () { close(); },
                onerror: function (error) {
                    setHint('Playback failed: ' + describe(error));
                },
                onbufferingstart: function () { setHint('Buffering…'); },
                onbufferingprogress: function (percent) { setHint('Buffering ' + percent + '%'); },
                onbufferingcomplete: function () { setHint(''); }
            });
            av.prepareAsync(function () {
                if (startMs > 0) {
                    try { av.seekTo(Math.round(startMs)); } catch (ignored) { /* ignore */ }
                }
                av.play();
                refreshTracks();
                updateControls();
                setHint('');
            }, function (error) {
                setHint(startFailure(error));
            });
        } catch (failure) {
            setHint(startFailure(failure));
        }
    }

    function startHtml(url, startMs) {
        video.classList.remove('hidden');
        video.src = url;
        video.style.objectFit = DISPLAY_MODES[displayMode].html;
        video.addEventListener('ended', function () { close(); });
        video.addEventListener('error', function () {
            setHint('Playback failed: the browser rejected the stream.');
        });

        if (startMs > 0) { video.currentTime = startMs / 1000; }

        var started = video.play();
        if (started && started.catch) {
            started.catch(function () { setHint('Press OK to start playback'); });
        }
        updateControls();
    }

    function position() {
        if (!active) { return 0; }
        if (mode === 'avplay') {
            try { return global.webapis.avplay.getCurrentTime() || 0; } catch (ignored) { return 0; }
        }
        return (video.currentTime || 0) * 1000;
    }

    function duration() {
        if (!active) { return 0; }
        if (mode === 'avplay') {
            try { return global.webapis.avplay.getDuration() || 0; } catch (ignored) { return 0; }
        }
        return (video.duration || 0) * 1000;
    }

    function seekTo(ms) {
        if (!active) { return; }
        var total = duration();
        if (ms < 0) { ms = 0; }
        if (total > 0 && ms > total - 1000) { ms = total - 1000; }

        if (mode === 'avplay') {
            try { global.webapis.avplay.seekTo(Math.round(ms)); } catch (ignored) { /* ignore */ }
        } else {
            video.currentTime = ms / 1000;
        }
        tick();
        showControls();
    }

    function toggle() {
        if (!active) { return; }
        if (mode === 'avplay') {
            var av = global.webapis.avplay;
            try {
                if (av.getState() === 'PLAYING') { av.pause(); }
                else { av.play(); }
            } catch (ignored) { /* ignore */ }
        } else if (video.paused) {
            video.play();
        } else {
            video.pause();
        }
        updateControls();
        showControls();
    }

    function tick() {
        if (!active) { return; }
        var pos = position();
        var total = duration();
        posEl.textContent = UI.formatTime(pos);
        if (total > 0) {
            durEl.textContent = UI.formatTime(total);
            fillEl.style.width = Math.min(100, (pos / total) * 100) + '%';
        }

        if (audioTracks.length === 0 && textTracks.length === 0) { refreshTracks(); }
        updateControls();
    }

    function report(force) {
        if (!ctx) { return; }
        var pos = position();
        if (pos < 1000) { return; }
        if (!force && lastReported >= 0 && Math.abs(pos - lastReported) < 5000) { return; }
        lastReported = pos;
        ArcTV.postProgress(ctx.host, ctx.item.id, pos, duration() || ctx.item.durationMs || 0);
    }

    function closeSilently() {
        if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
        if (reportTimer) { clearInterval(reportTimer); reportTimer = null; }
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }

        sheetReturn = -1;
        closeSheet();
        clearControlFocus();

        if (mode === 'avplay') {
            try { global.webapis.avplay.stop(); } catch (ignored) { /* ignore */ }
            try { global.webapis.avplay.close(); } catch (ignored) { /* ignore */ }
        } else if (mode === 'html' && video) {
            try {
                video.pause();
                video.removeAttribute('src');
                video.load();
            } catch (ignored) { /* ignore */ }
        }

        mode = null;
        active = false;
    }

    function close() {
        if (!active) { return; }
        var finalPos = position();
        report(true);
        closeSilently();

        layer.classList.add('hidden');

        var done = ctx && ctx.onClose;
        ctx = null;
        if (done) { done(finalPos); }
    }

    function startFailure(error) {
        if (ctx && ctx.item && ctx.item.source === 'telegram') {
            return 'Could not start Telegram stream: ' + describe(error) +
                '. Keep your phone on the same Wi-Fi and stop other cloud playback.';
        }
        return 'Could not start: ' + describe(error);
    }

    function describe(error) {
        if (!error) { return 'unknown error'; }
        if (typeof error === 'string') { return error; }
        if (error.message) { return error.message; }
        try { return JSON.stringify(error); } catch (ignored) { return String(error); }
    }

    function handleKey(event) {
        if (!active) { return false; }
        var code = event.keyCode;
        showControls();

        if (sheetOpen) {
            if (code === 37 || code === 38) { moveSheet(-1); return true; }
            if (code === 39 || code === 40) { moveSheet(1); return true; }
            if (code === 13) { selectSheetOption(); return true; }
            if (code === 10009 || code === 27) { closeSheet(); return true; }
            if (code === 413) { close(); return true; }
            return true;
        }

        if (code === 38 || code === 40) {
            if (focusIndex < 0) { setControlFocus(0); }
            else { clearControlFocus(); }
            return true;
        }

        if (focusIndex >= 0 && code === 37) { moveControlFocus(-1); return true; }
        if (focusIndex >= 0 && code === 39) { moveControlFocus(1); return true; }

        if (code === 37) { seekBy(-SEEK_STEP_MS); return true; }
        if (code === 39) { seekBy(SEEK_STEP_MS); return true; }
        if (code === 13) {
            if (focusIndex >= 0) { activateControl(); }
            else { toggle(); }
            return true;
        }
        if (code === 415 || code === 19) { toggle(); return true; }
        if (code === 412) { seekBy(-LARGE_STEP_MS); return true; }
        if (code === 417) { seekBy(LARGE_STEP_MS); return true; }
        if (code === 413) { close(); return true; }
        if (code === 10009 || code === 27) { close(); return true; }
        return true;
    }

    global.Player = {
        open: open,
        close: close,
        isActive: isActive,
        handleKey: handleKey,
        position: position,
        duration: duration,
        seekTo: seekTo
    };
})(window);
