/*
 * Which television this is running on, and the two ways it differs from the other one.
 *
 * The app is written once and shipped to both panels, and the distance between them is smaller
 * than it looks: the markup, the geometry and the protocol are shared, the player already picks
 * its own backend by looking for `webapis.avplay`, and only the remote's names are platform
 * specific. So this file holds those two facts — what the back button arrives as, and whether the
 * media keys have to be asked for — and everything else reads the platform objects for itself.
 */
(function (global) {
    'use strict';

    /*
     * Samsung reports Back as 10009 and LG as 461. 27 stays because the desktop preview is driven
     * from a keyboard; no panel sends it.
     */
    var BACK_KEYS = [10009, 461, 27];

    /*
     * LG spells itself three ways across the generations: `webOS/3.5` in the old ones, `Web0S` — with
     * a zero — from webOS 6 up, and `WebAppManager` on every TV build beside both of those.
     */
    var WEBOS_UA = /webos|web0s|webappmanager/i;

    var userAgent = String((global.navigator && global.navigator.userAgent) || '');

    /*
     * A desktop browser cannot wear an LG user agent, so the preview asks with `?platform=webos`.
     * It renames the television — the pairing prompt, the telemetry badge — and changes no
     * behaviour the decoder decides; the player still selects its backend by finding `avplay`.
     */
    function pretend() {
        var search = String((global.location && global.location.search) || '');
        var found = /[?&]platform=(webos|tizen)\b/.exec(search);
        return found ? found[1] : '';
    }

    /* The Tizen runtime injects `window.tizen`; webOS says so in the user agent and nothing else. */
    var kind = pretend() || (global.tizen ? 'tizen' : (WEBOS_UA.test(userAgent) ? 'webos' : 'browser'));

    function isBack(event) {
        return BACK_KEYS.indexOf(event.keyCode) >= 0;
    }

    /*
     * Tizen swallows the transport keys until the app registers them. A webOS web app receives
     * every remote key by default and has no API to register anything, so the absence of
     * `tvinputdevice` is the whole of the webOS branch.
     */
    function registerKeys() {
        var device = global.tizen && global.tizen.tvinputdevice;
        if (!device || !device.registerKey) { return; }
        ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop',
            'MediaFastForward', 'MediaRewind'].forEach(function (key) {
            try { device.registerKey(key); } catch (ignored) { /* ignore */ }
        });
    }

    global.Platform = {
        kind: kind,
        isBack: isBack,
        registerKeys: registerKeys
    };
})(window);
