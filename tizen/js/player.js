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
            return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false">' +
                paths + '</svg>';
        }

        return {
            previous: svg(
                '<path fill="currentColor" stroke-linejoin="round" d="M8.06492 12.6258C8.31931 13.8374 9.67295 14.7077 12.3802 16.4481C15.3247 18.3411 16.797 19.2876 17.9895 18.9229C18.3934 18.7994 18.7654 18.5823 19.0777 18.2876C20 17.4178 20 15.6118 20 12C20 8.38816 20 6.58224 19.0777 5.71235C18.7654 5.41773 18.3934 5.20057 17.9895 5.07707C16.797 4.71243 15.3247 5.6589 12.3802 7.55186C9.67295 9.29233 8.31931 10.1626 8.06492 11.3742C7.97836 11.7865 7.97836 12.2135 8.06492 12.6258Z"/>' +
                '<path stroke-linecap="round" d="M4 4V20"/>'
            ),
            next: svg(
                '<path fill="currentColor" stroke-linejoin="round" d="M15.9351 12.6258C15.6807 13.8374 14.327 14.7077 11.6198 16.4481C8.67528 18.3411 7.20303 19.2876 6.01052 18.9229C5.60662 18.7994 5.23463 18.5823 4.92227 18.2876C4 17.4178 4 15.6118 4 12C4 8.38816 4 6.58224 4.92227 5.71235C5.23463 5.41773 5.60662 5.20057 6.01052 5.07707C7.20304 4.71243 8.67528 5.6589 11.6198 7.55186C14.327 9.29233 15.6807 10.1626 15.9351 11.3742C16.0216 11.7865 16.0216 12.2135 15.9351 12.6258Z"/>' +
                '<path stroke-linecap="round" d="M20 5V19"/>'
            ),
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
    var loadingEl = null;
    var loadingMessageEl = null;
    var errorBackEl = null;
    var backdropEl = null;
    var logoEl = null;
    var workTitleEl = null;
    var contextEl = null;
    var backEl = null;
    var logoImage = null;
    var backdropImage = null;
    // Keep just the last decoded logo: episode switches reuse it without an artwork cache growing.
    var cachedLogo = null;
    var cachedLogoUrl = '';

    var ctx = null;
    var mode = null;
    var active = false;
    var generation = 0;
    var htmlHandlers = [];
    var ready = false;
    var loading = false;
    var initialLoad = true;
    var failed = false;
    var buffering = false;
    var seeking = false;
    var hasPlayed = false;
    var lastPlayedPosition = 0;
    var actualDuration = 0;
    var observedPosition = null;
    var observedAt = 0;
    var contextAction = null;
    var CONTEXT_FOCUS = -2;

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
        loadingEl = document.getElementById('player-loading');
        loadingMessageEl = document.getElementById('player-loading-message');
        errorBackEl = document.getElementById('player-error-back');
        backdropEl = document.getElementById('player-backdrop');
        logoEl = document.getElementById('player-logo');
        workTitleEl = document.getElementById('player-work-title');
        contextEl = document.getElementById('player-context');
        backEl = document.getElementById('player-back');
        backEl.addEventListener('click', function () { close(); });
        contextEl.addEventListener('click', function () { activateContext(); });
    }

    function isActive() { return active; }
    function isCurrent(gen) { return active && generation === gen; }
    function canContinue(gen) { return isCurrent(gen) && !failed; }
    function positive(value) {
        value = Number(value);
        return isFinite(value) && value > 0 ? value : 0;
    }

    function clearBackdrop() {
        if (backdropImage) { backdropImage.onload = null; backdropImage.onerror = null; }
        backdropImage = null;
        UI.clear(backdropEl);
    }

    function loadArtwork(options, gen) {
        UI.clear(logoEl);
        logoEl.classList.add('hidden');
        workTitleEl.classList.remove('hidden');
        workTitleEl.textContent = options.workTitle || options.title || options.item.title || '';
        var url = options.logoUrl ? ArcTV.absolute(options.host, options.logoUrl) : '';
        if (url) {
            logoImage = url === cachedLogoUrl && cachedLogo ? cachedLogo : new Image();
            var image = logoImage;
            image.alt = workTitleEl.textContent;
            function reveal() {
                if (!isCurrent(gen) || !image.naturalWidth) { return; }
                image.onload = null;
                image.onerror = null;
                cachedLogo = image;
                cachedLogoUrl = url;
                logoEl.appendChild(image);
                logoEl.classList.remove('hidden');
                workTitleEl.classList.add('hidden');
            }
            image.onload = reveal;
            image.onerror = function () {
                if (!isCurrent(gen)) { return; }
                image.onload = null;
                image.onerror = null;
                logoEl.classList.add('hidden');
                workTitleEl.classList.remove('hidden');
            };
            if (image === cachedLogo) { reveal(); }
            else { image.src = url; }
        }
        clearBackdrop();
        if (options.backdropUrl) {
            backdropImage = new Image();
            var backdrop = backdropImage;
            backdrop.alt = '';
            backdrop.onload = function () {
                if (!isCurrent(gen) || !initialLoad) { return; }
                backdrop.onload = null;
                backdrop.onerror = null;
                backdropEl.appendChild(backdrop);
            };
            backdrop.onerror = function () {
                if (isCurrent(gen)) { clearBackdrop(); }
            };
            backdrop.src = ArcTV.absolute(options.host, options.backdropUrl);
        }
    }

    function showLoading(message) {
        loading = true;
        loadingEl.classList.remove('hidden');
        layer.classList.add('is-loading');
        layer.setAttribute('aria-busy', failed ? 'false' : 'true');
        loadingMessageEl.textContent = message || 'Loading…';
        contextAction = null;
        contextEl.classList.add('hidden');
        closeSheet();
        clearControlFocus();
        showControls();
    }

    function hideLoading() {
        if (failed) { return; }
        var wasLoading = loading;
        loading = false;
        loadingEl.classList.add('hidden');
        layer.classList.remove('is-loading');
        layer.setAttribute('aria-busy', 'false');
        if (wasLoading) { showControls(); }
    }

    function fail(message) {
        if (!active || failed) { return; }
        failed = true;
        seeking = false;
        buffering = false;
        layer.classList.add('has-error');
        errorBackEl.classList.remove('hidden');
        showLoading(message);
        // Leave the failed frame in place, but never continue unseen behind the error.
        try {
            if (mode === 'avplay' && global.webapis.avplay.getState() === 'PLAYING') {
                global.webapis.avplay.pause();
            } else if (mode === 'html') { video.pause(); }
        } catch (ignored) { /* Back still closes the engine */ }
    }

    function trustedBounds() {
        var item = ctx && ctx.item;
        var cached = item && positive(item.durationMs);
        var total = actualDuration;
        if (!cached || !total || Math.abs(total - cached) > Math.max(2000, cached * 0.05)) {
            return null;
        }
        var intro = positive(item.introEndMs);
        var outro = positive(item.outroStartMs);
        var end = item.outroEndMs === undefined || item.outroEndMs === null ?
            total : positive(item.outroEndMs);
        if (intro <= 1500 || intro >= total / 2) { intro = 0; }
        if (outro < total / 2 || outro <= intro || outro >= end || end > total) {
            outro = 0;
        }
        return { intro: intro, outro: outro, end: end };
    }

    function updateContext(pos) {
        var bounds = trustedBounds();
        var action = null;
        if (ready && hasPlayed && !loading && !failed && !sheetOpen && bounds) {
            if (bounds.intro && pos < bounds.intro - 1500) { action = 'intro'; }
            else if (ctx.hasNext && typeof ctx.onStep === 'function' &&
                    pos >= (bounds.outro || Math.max(0, actualDuration - 20000))) { action = 'next'; }
        }
        contextAction = action;
        contextEl.classList.toggle('hidden', !action);
        if (!action) {
            if (focusIndex === CONTEXT_FOCUS) { clearControlFocus(); }
            return;
        }
        var label = action === 'intro' ? 'Skip intro' : 'Next episode';
        if (contextEl.textContent !== label) { contextEl.textContent = label; }
        contextEl.setAttribute('aria-label', label);
    }

    function focusContext() {
        if (!contextAction || loading || failed) { return; }
        clearControlFocus();
        focusIndex = CONTEXT_FOCUS;
        contextEl.classList.add('focused');
        contextEl.focus();
        setHint(contextEl.textContent);
        showControls();
    }

    function activateContext() {
        if (!active || loading || failed) { return; }
        updateContext(position());
        if (contextAction === 'intro') { seekTo(trustedBounds().intro); }
        else if (contextAction === 'next') { step(1); }
    }

    function setHint(text) { if (hintEl) { hintEl.textContent = text || ''; } }

    function showControls() {
        if (!overlay || !active) { return; }
        overlay.classList.remove('faded');
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        if (sheetOpen || loading || failed) { return; }
        var gen = generation;
        hideTimer = setTimeout(function () {
            if (!canContinue(gen) || sheetOpen || loading) { return; }
            overlay.classList.add('faded');
            clearControlFocus();
        }, HIDE_CONTROLS_MS);
    }

    function buildControls() {
        UI.clear(controlsEl);
        controlItems = [];

        var gen = generation;
        var definitions = [
            { name: 'Fit to screen', icon: DISPLAY_MODES[displayMode].icon, action: cycleDisplayMode, aspect: true },
            { name: 'Subtitles', icon: 'subtitles', track: 'TEXT', action: function () { openSheet('TEXT'); } },
            { name: 'Audio', icon: 'audio', track: 'AUDIO', action: function () { openSheet('AUDIO'); } }
        ];

        if (ctx && typeof ctx.onStep === 'function') {
            if (ctx.hasPrevious) {
                definitions.unshift({ name: 'Previous episode', icon: 'previous', action: function () { step(-1); } });
            }
            if (ctx.hasNext) {
                definitions.push({ name: 'Next episode', icon: 'next', action: function () { step(1); } });
            }
        }
        for (var i = 0; i < definitions.length; i++) {
            (function (definition) {
                var el = UI.el('button', 'player-control');
                el.type = 'button';
                el.tabIndex = -1;
                el.innerHTML = ICONS[definition.icon];
                el.setAttribute('aria-label', definition.name);
                el.addEventListener('click', function () {
                    if (canContinue(gen) && !loading && ready) { definition.action(); }
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
        if (loading || failed || controlItems.length === 0) { return; }
        clearControlFocus();
        if (index < 0) { index = 0; }
        if (index >= controlItems.length) { index = controlItems.length - 1; }
        focusIndex = index;

        for (var i = 0; i < controlItems.length; i++) {
            if (i === focusIndex) { controlItems[i].el.classList.add('focused'); }
            else { controlItems[i].el.classList.remove('focused'); }
        }

        var item = controlItems[focusIndex];
        item.el.focus();
        setHint(item.aspect ? DISPLAY_MODES[displayMode].label : item.name);
        showControls();
    }

    function clearControlFocus() {
        focusIndex = -1;
        if (contextEl) { contextEl.classList.remove('focused'); contextEl.blur(); }
        for (var i = 0; i < controlItems.length; i++) {
            controlItems[i].el.classList.remove('focused');
            controlItems[i].el.blur();
        }
        setHint('Left / Right to seek · OK to pause · Up / Down for controls');
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
                item.el.setAttribute('aria-disabled', count === 0 ? 'true' : 'false');
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
        if (!active || loading || failed || !ready) { return; }
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
        contextEl.classList.add('hidden');
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
        if (document.activeElement && sheetEl.contains(document.activeElement)) { document.activeElement.blur(); }
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
        var gen = generation;
        sheetItems = [];
        sheetOptionsEl.scrollTop = 0;

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
                var row = UI.el('button', 'player-option');
                row.type = 'button';
                row.tabIndex = -1;
                row.setAttribute('aria-label', option.label + (option.meta ? ', ' + option.meta : ''));
                row.setAttribute('aria-pressed', option.meta === 'Current' ? 'true' : 'false');
                if (option.meta === 'Current') { row.classList.add('selected'); }

                var label = UI.el('span', 'player-option-label', option.label);
                var meta = UI.el('span', 'player-option-meta', option.meta);
                row.appendChild(label);
                row.appendChild(meta);

                row.addEventListener('click', function () {
                    if (!canContinue(gen) || !sheetOpen || loading) { return; }
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
        var selected = sheetItems[sheetIndex];
        if (selected) {
            selected.el.focus({ preventScroll: true });
            var top = selected.el.offsetTop;
            var bottom = top + selected.el.offsetHeight;
            if (top < sheetOptionsEl.scrollTop) { sheetOptionsEl.scrollTop = top; }
            else if (bottom > sheetOptionsEl.scrollTop + sheetOptionsEl.clientHeight) {
                sheetOptionsEl.scrollTop = bottom - sheetOptionsEl.clientHeight;
            }
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

    function seekBy(delta) { seekTo(position() + delta); }

    function open(options) {
        init();
        closeSilently();
        var gen = generation;
        ctx = options;
        active = true;
        ready = false;
        failed = false;
        buffering = false;
        seeking = false;
        initialLoad = true;
        hasPlayed = false;
        lastPlayedPosition = 0;
        actualDuration = 0;
        observedPosition = null;
        lastReported = -1;
        audioTracks = [];
        textTracks = [];
        displayMode = 0;
        focusIndex = -1;
        contextAction = null;
        layer.classList.remove('hidden', 'has-error');
        layer.classList.add('is-opening');
        errorBackEl.classList.add('hidden');
        sheetEl.classList.add('hidden');
        titleEl.textContent = options.title || options.item.title || '';
        posEl.textContent = '0:00';
        durEl.textContent = '0:00';
        fillEl.style.width = '0%';
        buildControls();
        loadArtwork(options, gen);
        showLoading(options.item.source === 'telegram' ? 'Fetching from Telegram through your phone…' : 'Loading…');

        var url = ArcTV.streamUrl(options.host, options.item.id);
        var startMs = positive(options.startMs);
        if (hasAvplay()) {
            mode = 'avplay';
            video.classList.add('hidden');
            startAvplay(url, startMs, gen);
        } else {
            mode = 'html';
            avObject.classList.add('hidden');
            startHtml(url, startMs, gen);
        }
        if (!canContinue(gen)) { return; }
        tickTimer = setInterval(function () { if (canContinue(gen)) { tick(); } }, 500);
        reportTimer = setInterval(function () { if (canContinue(gen)) { report(); } }, REPORT_MS);
    }

    function resetObservation() {
        observedPosition = position();
        observedAt = Date.now();
    }

    function isPaused() {
        if (!ready || failed) { return false; }
        if (mode === 'avplay') {
            try { return global.webapis.avplay.getState() === 'PAUSED'; } catch (ignored) { return false; }
        }
        return video.paused && !video.ended;
    }

    function isPlaying() {
        if (!ready || failed) { return false; }
        if (mode === 'avplay') {
            try { return global.webapis.avplay.getState() === 'PLAYING'; } catch (ignored) { return false; }
        }
        return !video.paused && !video.ended && video.readyState >= 3;
    }

    // A seek target, READY state or play() call proves nothing was watched. Only an advancing
    // playback clock can replace the last watched position, including after a paused seek.
    function observePlayback(pos) {
        if (!active || !ready || seeking || buffering || !isPlaying()) { return; }
        pos = positive(pos);
        var now = Date.now();
        if (observedPosition !== null && pos > observedPosition &&
                pos - observedPosition <= Math.max(2000, (now - observedAt) * 2 + 500)) {
            hasPlayed = true;
            lastPlayedPosition = pos;
            duration();
            if (initialLoad) {
                initialLoad = false;
                layer.classList.remove('is-opening');
                clearBackdrop();
            }
            hideLoading();
        }
        if (pos !== observedPosition) {
            observedPosition = pos;
            observedAt = now;
        }
    }

    function bufferStart() {
        buffering = true;
        observedPosition = null;
        showLoading(seeking ? 'Seeking…' : 'Buffering…');
    }

    function bufferComplete() {
        buffering = false;
        resetObservation();
        // Completion is not proof that playback started. Paused buffering is the exception.
        if (!initialLoad && !seeking && isPaused()) { hideLoading(); }
    }

    function startAvplay(url, startMs, gen) {
        var av = global.webapis.avplay;
        try { av.close(); } catch (ignored) { /* nothing open */ }
        avObject.classList.remove('hidden');
        function playPrepared() {
            if (!canContinue(gen)) { return; }
            seeking = false;
            buffering = false;
            observedPosition = null;
            try {
                av.play();
                if (canContinue(gen)) { refreshTracks(); }
            } catch (error) { if (canContinue(gen)) { fail(startFailure(error)); } }
        }
        try {
            av.open(url);
            av.setDisplayRect(0, 0, 1920, 1080);
            av.setDisplayMethod(DISPLAY_MODES[displayMode].value);
            av.setListener({
                oncurrentplaytime: function (ms) {
                    if (canContinue(gen)) { observePlayback(ms); }
                },
                onstreamcompleted: function () {
                    if (canContinue(gen) && ready && !seeking && !initialLoad) { finish(true, 0); }
                },
                onerror: function (error) {
                    if (canContinue(gen)) { fail('Playback failed: ' + describe(error)); }
                },
                onbufferingstart: function () { if (canContinue(gen)) { bufferStart(); } },
                onbufferingprogress: function (percent) {
                    if (canContinue(gen) && buffering && !seeking) {
                        loadingMessageEl.textContent = 'Buffering ' + Math.max(0, Math.min(100, Number(percent) || 0)) + '%';
                    }
                },
                onbufferingcomplete: function () { if (canContinue(gen)) { bufferComplete(); } }
            });
            av.prepareAsync(function () {
                if (!canContinue(gen)) { return; }
                ready = true;
                duration();
                var target = clampSeek(startMs);
                if (target > 0) {
                    seeking = true;
                    try {
                        av.seekTo(Math.round(target), playPrepared, function (error) {
                            if (canContinue(gen)) { fail('Could not resume: ' + describe(error)); }
                        });
                    } catch (error) { if (canContinue(gen)) { fail('Could not resume: ' + describe(error)); } }
                } else { playPrepared(); }
            }, function (error) {
                if (canContinue(gen)) { fail(startFailure(error)); }
            });
        } catch (failure) { if (canContinue(gen)) { fail(startFailure(failure)); } }
    }

    function onHtml(name, gen, handler) {
        var guarded = function () { if (canContinue(gen)) { handler(); } };
        video.addEventListener(name, guarded);
        htmlHandlers.push({ name: name, handler: guarded });
    }

    function playHtml(gen) {
        if (!canContinue(gen)) { return; }
        resetObservation();
        try {
            var started = video.play();
            if (started && started.catch) {
                started.catch(function (error) {
                    if (canContinue(gen)) { fail('Could not start browser playback: ' + describe(error)); }
                });
            }
        } catch (error) { if (canContinue(gen)) { fail(startFailure(error)); } }
    }

    function startHtml(url, startMs, gen) {
        var initialResume = false;
        video.classList.remove('hidden');
        video.style.objectFit = DISPLAY_MODES[displayMode].html;
        onHtml('loadedmetadata', gen, function () {
            if (ready) { return; }
            ready = true;
            duration();
            var target = clampSeek(startMs);
            if (target > 0 && Math.abs(position() - target) > 50) {
                initialResume = true;
                seeking = true;
                try { video.currentTime = target / 1000; }
                catch (error) { fail('Could not resume: ' + describe(error)); }
            } else { playHtml(gen); }
        });
        onHtml('seeking', gen, function () {
            seeking = true;
            observedPosition = null;
            showLoading('Seeking…');
        });
        onHtml('seeked', gen, function () {
            if (!ready || !seeking || video.seeking) { return; }
            seeking = false;
            buffering = false;
            resetObservation();
            if (initialResume) { initialResume = false; playHtml(gen); }
            else if (video.paused && !initialLoad) { hideLoading(); }
        });
        onHtml('playing', gen, function () { buffering = false; resetObservation(); });
        onHtml('timeupdate', gen, function () { observePlayback(position()); });
        onHtml('waiting', gen, bufferStart);
        onHtml('canplay', gen, bufferComplete);
        onHtml('ended', gen, function () {
            if (ready && !seeking && !initialLoad && video.ended) { finish(true, 0); }
        });
        onHtml('error', gen, function () { fail('Playback failed: the browser rejected the stream.'); });
        video.src = url;
        video.load();
        updateControls();
    }

    function position() {
        if (!active || !ready) { return 0; }
        if (mode === 'avplay') {
            try { return positive(global.webapis.avplay.getCurrentTime()); } catch (ignored) { return 0; }
        }
        return positive(video.currentTime) * 1000;
    }

    function duration() {
        if (!active) { return 0; }
        var total = 0;
        if (ready && mode === 'avplay') {
            try { total = positive(global.webapis.avplay.getDuration()); } catch (ignored) { /* not ready */ }
        } else if (ready && mode === 'html') { total = positive(video.duration) * 1000; }
        if (total > 0) { actualDuration = total; }
        return actualDuration;
    }

    function clampSeek(ms) {
        var total = duration();
        return Math.max(0, total > 0 ? Math.min(positive(ms), total - 1000) : positive(ms));
    }

    function seekTo(ms) {
        if (!active || !ready || loading || failed || seeking || !duration()) { return; }
        ms = clampSeek(ms);
        if (Math.abs(ms - position()) < 250) { return; }
        observePlayback(position());
        var gen = generation;
        var resume = isPlaying();
        seeking = true;
        buffering = false;
        observedPosition = null;
        showLoading('Seeking…');
        try {
            if (mode === 'avplay') {
                var av = global.webapis.avplay;
                if (resume) { av.pause(); }
                av.seekTo(Math.round(ms), function () {
                    if (!canContinue(gen)) { return; }
                    seeking = false;
                    buffering = false;
                    observedPosition = null;
                    if (resume) {
                        try { av.play(); } catch (error) { fail('Could not continue: ' + describe(error)); }
                    } else { hideLoading(); }
                }, function (error) {
                    if (canContinue(gen)) { fail('Could not seek: ' + describe(error)); }
                });
            } else { video.currentTime = ms / 1000; }
        } catch (error) { if (canContinue(gen)) { fail('Could not seek: ' + describe(error)); } }
    }

    function toggle() {
        if (!active || !ready || loading || failed) { return; }
        observePlayback(position());
        try {
            if (mode === 'avplay') {
                var av = global.webapis.avplay;
                if (av.getState() === 'PLAYING') { av.pause(); }
                else { resetObservation(); av.play(); }
            } else if (video.paused) { playHtml(generation); }
            else { video.pause(); }
        } catch (error) { fail('Could not change playback: ' + describe(error)); }
        updateControls();
        showControls();
    }

    function tick() {
        if (!active || failed) { return; }
        var pos = position();
        var total = duration();
        observePlayback(pos);
        posEl.textContent = UI.formatTime(pos);
        if (total > 0) {
            durEl.textContent = UI.formatTime(total);
            fillEl.style.width = Math.min(100, (pos / total) * 100) + '%';
        }
        updateContext(pos);
        if (ready && !loading && audioTracks.length === 0 && textTracks.length === 0) { refreshTracks(); }
        updateControls();
    }

    function report(force) {
        if (!ctx || !hasPlayed) { return; }
        var pos = lastPlayedPosition;
        if (pos < 1000) { return; }
        if (!force && lastReported >= 0 && Math.abs(pos - lastReported) < 5000) { return; }
        lastReported = pos;
        // The phone applies ResumeRules (including its non-credit tail) to this observed position.
        // Do not turn the resume-clearing tail into a watched verdict or send a requested seek.
        try { ArcTV.postProgress(ctx.host, ctx.item.id, pos, duration() || positive(ctx.item.durationMs)); }
        catch (ignored) { /* progress is best effort; cleanup must still happen */ }
    }

    function closeSilently() {
        // Invalidate first: stop/close/load can themselves dispatch old media callbacks.
        generation++;
        active = false;
        if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
        if (reportTimer) { clearInterval(reportTimer); reportTimer = null; }
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        for (var i = 0; i < htmlHandlers.length; i++) {
            video.removeEventListener(htmlHandlers[i].name, htmlHandlers[i].handler);
        }
        htmlHandlers = [];
        if (logoImage) { logoImage.onload = null; logoImage.onerror = null; }
        logoImage = null;
        clearBackdrop();
        sheetReturn = -1;
        closeSheet();
        clearControlFocus();
        if (document.activeElement && layer.contains(document.activeElement)) { document.activeElement.blur(); }
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
        ctx = null;
        ready = false;
        loading = false;
        contextAction = null;
        layer.classList.add('hidden');
        layer.setAttribute('aria-busy', 'false');
    }

    function finish(ended, delta) {
        if (!active) { return; }
        var finalPos = hasPlayed ? lastPlayedPosition : 0;
        var total = duration() || positive(ctx.item.durationMs);
        var bounds = trustedBounds();
        var finished = hasPlayed && (ended || !!(bounds && bounds.outro &&
            finalPos >= bounds.outro && finalPos <= bounds.end));
        var done = delta ? ctx.onStep : ctx.onClose;
        report(true);
        closeSilently();
        // The callback may synchronously open the next episode. Nothing old may run after it.
        if (typeof done === 'function') {
            if (delta) { done(delta, finalPos, total, finished); }
            else { done(finalPos, total, finished); }
        }
    }

    function step(delta) {
        if (!active || loading || failed || (delta !== -1 && delta !== 1) ||
                typeof ctx.onStep !== 'function' || !(delta < 0 ? ctx.hasPrevious : ctx.hasNext)) { return; }
        finish(false, delta);
    }

    function close() { finish(false, 0); }

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
        if (loading || failed) {
            if (Platform.isBack(event) || code === 413) { close(); }
            return true;
        }

        if (sheetOpen) {
            if (code === 37 || code === 38) { moveSheet(-1); return true; }
            if (code === 39 || code === 40) { moveSheet(1); return true; }
            if (code === 13) { selectSheetOption(); return true; }
            if (Platform.isBack(event)) { closeSheet(); return true; }
            if (code === 413) { close(); return true; }
            return true;
        }

        if (code === 38) {
            if (focusIndex >= 0 || focusIndex === CONTEXT_FOCUS) { clearControlFocus(); }
            else if (contextAction) { focusContext(); }
            else { setControlFocus(0); }
            return true;
        }
        if (code === 40) {
            if (focusIndex < 0) { setControlFocus(0); }
            else { clearControlFocus(); }
            return true;
        }

        if (focusIndex >= 0 && code === 37) { moveControlFocus(-1); return true; }
        if (focusIndex >= 0 && code === 39) { moveControlFocus(1); return true; }
        if (focusIndex === CONTEXT_FOCUS && (code === 37 || code === 39)) { return true; }
        if (code === 37) { seekBy(-SEEK_STEP_MS); return true; }
        if (code === 39) { seekBy(SEEK_STEP_MS); return true; }
        if (code === 13) {
            if (focusIndex === CONTEXT_FOCUS) { activateContext(); }
            else if (focusIndex >= 0) { activateControl(); }
            else { toggle(); }
            return true;
        }
        if (code === 415 || code === 19 || code === 10252) { toggle(); return true; }
        if (code === 412) { seekBy(-LARGE_STEP_MS); return true; }
        if (code === 417) { seekBy(LARGE_STEP_MS); return true; }
        if (code === 413) { close(); return true; }
        if (Platform.isBack(event)) { close(); return true; }
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
