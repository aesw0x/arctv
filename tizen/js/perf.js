/*
 * Diagnostic build, inert unless the page is opened with `?telemetry=<address>:<port>`.
 *
 * Reports input-to-paint latency, main-thread tasks over 50 ms and the environment (viewport,
 * device pixel ratio, AVPlay availability) to whatever is listening at that address, so the TV can
 * be measured without a debugging channel — a TV in developer mode blocks `sdb shell`, so there is
 * no dlog and no reachable devtools socket.
 *
 * `tools/telemetry-server.js` is the collector used while developing.
 */
(function (global) {
    'use strict';

    var queue = [];
    var handlerMs = 0;

    /*
     * Nothing is sent unless the page is opened with `?telemetry=<address>:8099`, so an ordinary
     * launch runs none of this. Pass the address of whatever is listening when you want numbers.
     */
    var match = /[?&]telemetry=([^&]+)/.exec(global.location.search || '');
    if (!match) { return; }
    var ENDPOINT = 'http://' + decodeURIComponent(match[1]) + '/api/telemetry';

    function now() { return performance.now(); }

    function send(entries) {
        try {
            global.fetch(ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
                body: JSON.stringify(entries)
            })['catch'](function () { /* the phone may vanish; telemetry is best effort */ });
        } catch (ignored) { /* nothing here may interrupt the app */ }
    }

    queue.push({
        type: 'env',
        ua: global.navigator.userAgent,
        w: global.innerWidth,
        h: global.innerHeight,
        dpr: global.devicePixelRatio,
        screenW: global.screen && global.screen.width,
        screenH: global.screen && global.screen.height,
        platform: global.Platform && global.Platform.kind,
        tizen: global.tizen ? String(global.tizen.version || 'yes') : 'no',
        avplay: !!(global.webapis && global.webapis.avplay)
    });

    global.setInterval(function () {
        if (queue.length === 0) { return; }
        send(queue.splice(0, queue.length));
    }, 1000);

    /*
     * Timing the app's own key handler. `app.js` calls `Focus.handleKey` through the object, not
     * through a captured reference, so wrapping it after the fact is still in time.
     */
    function patch() {
        if (!global.Focus || global.Focus.__timed) { return; }
        var original = global.Focus.handleKey;
        global.Focus.handleKey = function (event) {
            var started = now();
            var result = original.call(global.Focus, event);
            handlerMs = Math.round((now() - started) * 10) / 10;
            return result;
        };
        global.Focus.__timed = true;
    }

    patch();
    global.document.addEventListener('DOMContentLoaded', patch);

    /*
     * How long a whole screen costs to rebuild, and how much DOM the rebuild leaves behind.
     * perf.js loads after every module, so these globals already exist and app.js reaches them
     * through the object, not a captured reference.
     */
    function wrapRender(name, label) {
        var screen = global[name];
        if (!screen || !screen.render || screen.__timedRender) { return; }
        var original = screen.render;
        screen.render = function () {
            var started = now();
            var result = original.apply(screen, arguments);
            queue.push({
                type: 'render',
                label: label,
                ms: Math.round((now() - started) * 10) / 10,
                nodes: document.getElementsByTagName('*').length
            });
            var painted = 0;
            global.requestAnimationFrame(function () {
                painted = now();
                global.requestAnimationFrame(function () {
                    queue.push({ type: 'painted', label: label, ms: Math.round(painted - started) });
                });
            });
            return result;
        };
        screen.__timedRender = true;
    }

    wrapRender('LibraryScreen', 'library');
    wrapRender('DetailScreen', 'detail');
    wrapRender('PairingScreen', 'pairing');

    if (global.Player && global.Player.open && !global.Player.__timedOpen) {
        var originalOpen = global.Player.open;
        global.Player.open = function () {
            var started = now();
            var result = originalOpen.apply(global.Player, arguments);
            queue.push({ type: 'open', ms: Math.round((now() - started) * 10) / 10 });
            return result;
        };
        global.Player.__timedOpen = true;
    }

    var lastKeyAt = 0;
    var arrived = 0;

    // Capture phase, so this fires before the app's own listener: the moment the key reached the page.
    global.document.addEventListener('keydown', function (event) {
        var interesting = [13, 37, 38, 39, 40, 10009, 461, 10252];
        if (interesting.indexOf(event.keyCode) < 0) { return; }

        arrived = now();
        var sinceLast = lastKeyAt ? Math.round(arrived - lastKeyAt) : 0;
        lastKeyAt = arrived;
        var code = event.keyCode;

        global.requestAnimationFrame(function () {
            var painted = now();
            global.requestAnimationFrame(function () {
                queue.push({
                    type: 'key',
                    code: code,
                    handlerMs: handlerMs,
                    toFrame: Math.round(painted - arrived),
                    frame: Math.round(now() - painted),
                    total: Math.round(now() - arrived)
                });
            });
        });
    }, true);

    if (global.PerformanceObserver) {
        try {
            new global.PerformanceObserver(function (list) {
                var entries = list.getEntries();
                for (var i = 0; i < entries.length; i++) {
                    queue.push({ type: 'long', ms: Math.round(entries[i].duration) });
                }
            }).observe({ entryTypes: ['longtask'] });
        } catch (ignored) { /* not available on this browser */ }
    }

    global.addEventListener('load', function (event) {
        var target = event.target;
        if (target && target.tagName === 'IMG') {
            queue.push({
                type: 'img',
                ok: target.naturalWidth > 0,
                at: Math.round(now())
            });
        }
    }, true);
})(window);
