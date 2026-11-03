/*
 * Discovery, transport and token storage for the ArcTV client.
 *
 * A Tizen web app has no mDNS and no UDP, so finding the phone means asking every address on
 * the subnet a very short question and keeping every one that answers with our signature.
 *
 * Written for Chromium M76: no optional chaining, no nullish coalescing.
 */
(function (global) {
    'use strict';

    var PORT = 8080;
    var CONCURRENCY = 48;
    var SIGNATURE = 'arcplayer';

    /*
     * Home routers hand out addresses from a small set of /24s, so the sweep tries these in order
     * and stops at the first one that answers: the phone has to be on the TV's own network, so only
     * one of them can hold it. `?subnet=172.20.10.` forces a prefix outside the list.
     */
    var SUBNET_PREFIXES = ['192.168.1.', '192.168.0.', '192.168.100.', '10.0.0.'];

    var DEVICES_KEY = 'arctv.devices';
    var LAST_HOST_KEY = 'arctv.lastHost';

    function readJson(key, fallback) {
        try {
            var raw = localStorage.getItem(key);
            if (!raw) { return fallback; }
            return JSON.parse(raw);
        } catch (ignored) {
            return fallback;
        }
    }

    function writeJson(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (ignored) { /* private mode */ }
    }

    function devices() { return readJson(DEVICES_KEY, {}); }

    function entryFor(host) {
        var value = devices()[host];
        if (!value) { return null; }
        // Earlier builds stored a bare token string.
        if (typeof value === 'string') { return { token: value, name: host }; }
        return value;
    }

    function tokenFor(host) {
        var entry = entryFor(host);
        return entry ? entry.token : null;
    }

    function nameFor(host) {
        var entry = entryFor(host);
        return entry ? entry.name : null;
    }

    function saveToken(host, token, name) {
        var map = devices();
        var previous = entryFor(host);
        map[host] = {
            token: token,
            name: name || (previous ? previous.name : null) || host
        };
        writeJson(DEVICES_KEY, map);
    }

    function forgetToken(host) {
        var map = devices();
        delete map[host];
        writeJson(DEVICES_KEY, map);
    }

    function rememberHost(host) {
        try { localStorage.setItem(LAST_HOST_KEY, host); } catch (ignored) { /* ignore */ }
    }

    function lastHost() {
        try { return localStorage.getItem(LAST_HOST_KEY); } catch (ignored) { return null; }
    }

    function base(host) { return 'http://' + host + ':' + PORT; }

    /**
     * `?host=192.168.0.23` skips the sweep. Useful when a network blocks the scan, and the only
     * way to point a desktop browser at the mock during development.
     */
    function overrideHost() {
        var match = /[?&]host=([^&]+)/.exec(global.location.search || '');
        if (!match) { return null; }
        return decodeURIComponent(match[1]);
    }

    function overrideSubnet() {
        var match = /[?&]subnet=([^&]+)/.exec(global.location.search || '');
        if (!match) { return null; }
        return decodeURIComponent(match[1]);
    }

    function ping(host, timeoutMs) {
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, timeoutMs || 400);

        return fetch(base(host) + '/api/ping', {
            signal: controller.signal,
            cache: 'no-store'
        }).then(function (response) {
            clearTimeout(timer);
            if (!response.ok) { return null; }
            return response.json();
        }).then(function (body) {
            if (!body || body.service !== SIGNATURE) { return null; }
            return { host: host, port: PORT, info: body };
        }).catch(function () {
            clearTimeout(timer);
            return null;
        });
    }

    /**
     * Sweeps one /24 with a bounded worker pool and returns every responder, so the viewer can
     * choose between two phones on the same network.
     */
    function sweep(prefix, timeoutMs) {
        var hosts = [];
        for (var n = 1; n <= 254; n++) { hosts.push(prefix + n); }

        var next = 0;
        var found = [];

        function worker() {
            if (next >= hosts.length) { return Promise.resolve(); }
            var host = hosts[next++];
            return ping(host, timeoutMs).then(function (hit) {
                if (hit) { found.push(hit); }
                return worker();
            });
        }

        var workers = [];
        for (var i = 0; i < CONCURRENCY; i++) { workers.push(worker()); }

        return Promise.all(workers).then(function () { return sortHosts(found); });
    }

    function sortHosts(found) {
        found.sort(function (a, b) {
            return a.host.localeCompare(b.host, undefined, { numeric: true });
        });
        return found;
    }

    /**
     * A TV that has paired before knows exactly where its phone lives, so ask those addresses by
     * name first. One answer ends the search; a returning viewer should not wait on a sweep.
     */
    function pingSavedHosts() {
        var map = devices();
        var hosts = Object.keys(map);
        var last = lastHost();
        if (last && hosts.indexOf(last) < 0) { hosts.push(last); }
        if (hosts.length === 0) { return Promise.resolve([]); }

        return Promise.all(hosts.map(function (host) { return ping(host, 1200); }))
            .then(function (hits) { return sortHosts(hits.filter(Boolean)); });
    }

    function discover(timeoutMs) {
        timeoutMs = timeoutMs || 350;

        var forced = overrideHost();
        if (forced) {
            return ping(forced, 1500).then(function (hit) {
                return hit ? [hit] : [];
            });
        }

        var prefixes = overrideSubnet() ? [overrideSubnet()] : SUBNET_PREFIXES;

        return pingSavedHosts().then(function (known) {
            if (known.length) { return known; }

            var index = 0;
            function tryNextPrefix() {
                if (index >= prefixes.length) { return Promise.resolve([]); }
                return sweep(prefixes[index++], timeoutMs).then(function (found) {
                    return found.length ? found : tryNextPrefix();
                });
            }
            return tryNextPrefix();
        });
    }

    function requestJson(host, path, options) {
        options = options || {};
        var token = tokenFor(host);
        var url = base(host) + path;
        if (token) {
            url += (path.indexOf('?') >= 0 ? '&' : '?') + 'k=' + encodeURIComponent(token);
        }

        var init = { method: options.method || 'GET', cache: 'no-store' };
        if (options.body !== undefined) {
            init.headers = { 'Content-Type': 'application/json' };
            init.body = JSON.stringify(options.body);
        }

        return fetch(url, init).then(function (response) {
            if (response.status === 401) {
                forgetToken(host);
                var unauthorized = new Error('unauthorized');
                unauthorized.code = 401;
                throw unauthorized;
            }
            if (!response.ok) {
                var failure = new Error('http ' + response.status);
                failure.code = response.status;
                throw failure;
            }
            if (response.status === 204) { return null; }
            return response.json();
        });
    }

    function library(host) { return requestJson(host, '/api/library'); }

    /**
     * The model string the phone shows on its approval prompt, read from the set it is running on
     * rather than baked into the app. Both sources are TV-only and absent in the browser preview.
     */
    function deviceModel() {
        try {
            var info = global.webapis && global.webapis.productinfo;
            if (info && info.getModelName) {
                var name = info.getModelName();
                if (name) { return String(name); }
            }
        } catch (ignored) { /* not a Tizen TV */ }

        try {
            var capability = global.tizen && global.tizen.systeminfo && global.tizen.systeminfo.getCapability();
            if (capability && capability.deviceModel) { return String(capability.deviceModel); }
        } catch (ignored) { /* not a Tizen TV */ }

        return 'Smart TV';
    }

    function requestPairing(host, tvName) {
        return requestJson(host, '/api/pair/request', {
            method: 'POST',
            body: { tvModel: deviceModel(), tvName: tvName || 'TV' }
        });
    }

    function pairStatus(host, code) {
        return requestJson(host, '/api/pair/status?c=' + encodeURIComponent(code));
    }

    function absolute(host, path) {
        if (!path) { return null; }
        if (path.indexOf('http') === 0) { return path; }
        return base(host) + path;
    }

    function streamUrl(host, id) {
        var token = tokenFor(host) || '';
        return base(host) + '/stream/' + encodeURIComponent(String(id)) +
            '?k=' + encodeURIComponent(token);
    }

    function subtitlesUrl(host, id) {
        var token = tokenFor(host) || '';
        return base(host) + '/api/subtitles/' + encodeURIComponent(String(id)) +
            '?k=' + encodeURIComponent(token);
    }

    function postProgress(host, id, positionMs) {
        return requestJson(host, '/api/progress', {
            method: 'POST',
            body: { id: id, positionMs: Math.round(positionMs) }
        }).catch(function () { /* progress is best effort */ });
    }

    global.ArcTV = {
        PORT: PORT,
        ping: ping,
        discover: discover,
        base: base,
        library: library,
        requestPairing: requestPairing,
        pairStatus: pairStatus,
        absolute: absolute,
        streamUrl: streamUrl,
        subtitlesUrl: subtitlesUrl,
        postProgress: postProgress,
        tokenFor: tokenFor,
        nameFor: nameFor,
        saveToken: saveToken,
        forgetToken: forgetToken,
        rememberHost: rememberHost,
        lastHost: lastHost
    };
})(window);
