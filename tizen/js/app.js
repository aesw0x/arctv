/*
 * Navigation and boot.
 *
 * Three screens and one player. Back always goes up one level; at the library it is left to the
 * platform so the remote's back button can exit the app.
 */
(function (global) {
    'use strict';

    var SKELETON_CARDS = 7;

    var state = {
        screen: 'boot',
        host: null,
        deviceName: '',
        groups: [],
        group: null
    };

    var screens = {
        pairing: document.getElementById('screen-pairing'),
        library: document.getElementById('screen-library'),
        detail: document.getElementById('screen-detail')
    };

    /*
     * The only way a screen becomes visible. While the launch mark is up, Splash takes the request
     * rather than applying it — nothing paints, and nothing animates in, behind an opaque curtain.
     */
    function show(name) {
        if (Splash.hold(function () { show(name); })) { return; }
        Object.keys(screens).forEach(function (key) {
            if (key === name) { screens[key].classList.remove('hidden'); }
            else { screens[key].classList.add('hidden'); }
        });
    }

    function showPairing(options) {
        PairingScreen.stop();
        state.screen = 'pairing';
        show('pairing');

        PairingScreen.render(screens.pairing, {
            onPaired: function (host, token, name) {
                state.host = host;
                state.deviceName = name || host;
                ArcTV.rememberHost(host);
                loadLibrary();
            }
        }, options || {});
    }

    function goPairing() { showPairing(); }

    /**
     * Leaving the current phone. Switching keeps its pairing, so coming back is instant; forgetting
     * drops the token this TV holds for it, which is the most this side can do — the phone keeps its
     * own record of the TV until it is removed there.
     */
    function switchPhone() { showPairing({ scanAll: true }); }

    function forgetPhone() {
        if (state.host) { ArcTV.forgetToken(state.host); }
        state.host = null;
        state.deviceName = '';
        state.groups = [];
        state.group = null;
        showPairing({ scanAll: true });
    }

    /**
     * A hero and a rail of cards, greyed and shimmering, so the wait has the shape of the shelf
     * that is coming rather than a line of text.
     */
    function showLibraryLoading() {
        Focus.reset();
        UI.clear(screens.library);
        screens.library.appendChild(UI.el('div', 'skeleton-hero'));

        var rails = UI.el('div', 'rails');
        var label = UI.el('div', 'rail-label');
        label.appendChild(UI.el('span', 'skeleton-line'));
        rails.appendChild(label);

        var track = UI.el('div', 'rail-track');
        for (var i = 0; i < SKELETON_CARDS; i++) {
            var card = UI.el('div', 'card');
            card.appendChild(UI.el('div', 'skeleton-art'));
            track.appendChild(card);
        }
        rails.appendChild(track);
        screens.library.appendChild(rails);
    }

    function loadLibrary() {
        state.screen = 'loading';
        show('library');
        showLibraryLoading();

        ArcTV.library(state.host).then(function (payload) {
            state.groups = (payload && payload.groups) ? payload.groups : [];
            showLibrary();
        }).catch(function (error) {
            if (error && error.code === 401) { goPairing(); return; }
            showLibraryError();
        });
    }

    function showLibraryError() {
        UI.clear(screens.library);
        var wrap = UI.el('div', 'library-error');
        wrap.appendChild(UI.el('h1', 'screen-title', 'Cannot reach your phone'));
        wrap.appendChild(UI.el('p', 'screen-subtitle',
            'Make sure Arc Player is open, on the same Wi-Fi.'));

        var actions = UI.el('div', 'error-actions');
        var retry = UI.el('button', 'button button-primary', 'Try again');
        retry.addEventListener('click', loadLibrary);
        actions.appendChild(retry);

        var choose = UI.el('button', 'button', 'Choose another phone');
        choose.addEventListener('click', goPairing);
        actions.appendChild(choose);
        wrap.appendChild(actions);
        screens.library.appendChild(UI.arrive(wrap, 0));

        Focus.set([
            { el: retry, onSelect: loadLibrary },
            { el: choose, onSelect: goPairing }
        ], { columns: 2 });
    }

    function showLibrary() {
        state.screen = 'library';
        show('library');
        LibraryScreen.render(screens.library, {
            host: state.host,
            deviceName: state.deviceName,
            works: state.groups,
            focusWorkKey: state.group ? state.group.key : null,
            onSelect: showDetail,
            onPlay: function (work) { playWork(work, showLibrary); },
            onSwitchPhone: switchPhone,
            onForgetPhone: forgetPhone
        });
    }

    function showDetail(work) {
        state.screen = 'detail';
        state.group = work;
        show('detail');
        DetailScreen.render(screens.detail, {
            host: state.host,
            work: work,
            part: ArcTV.playPartOf(work),
            onPlay: function () { playWork(work, showDetail); },
            onPlayPart: function (part, startMs) { playPart(work, part, startMs, showDetail); }
        });
    }

    function playWork(work, onClose) {
        playPart(work, ArcTV.playPartOf(work), work.playResumeMs || 0, onClose);
    }

    function adjacentEpisode(work, part, delta) {
        var episodes = work.episodes || [];
        var episode = ArcTV.episodeOf(work, part.id);
        var index = episodes.indexOf(episode);
        return index >= 0 ? episodes[index + delta] : null;
    }

    function playPart(work, part, startMs, onClose) {
        if (!part) { return; }
        state.group = work;
        var label = ArcTV.partLabelOf(work, part);
        Player.open({
            host: state.host,
            item: part,
            title: label ? work.title + ' · ' + label : work.title,
            workTitle: work.title,
            logoUrl: work.logoUrl,
            backdropUrl: work.backdropUrl,
            startMs: startMs || 0,
            hasPrevious: !!adjacentEpisode(work, part, -1),
            hasNext: !!adjacentEpisode(work, part, 1),
            onStep: function (delta, finalMs, totalMs, finished) {
                stamp(work, part, finalMs, totalMs, finished);
                var next = adjacentEpisode(work, part, delta);
                if (next) {
                    playPart(work, ArcTV.partOf(work, next.playId), next.resumeMs, onClose);
                } else if (onClose) { onClose(work); }
            },
            onClose: function (finalMs, totalMs, finished) {
                stamp(work, part, finalMs, totalMs, finished);
                if (onClose) { onClose(work); }
            }
        });
    }

    function stamp(work, part, finalMs, totalMs, finished) {
        if (finalMs <= 0) { return; }
        var now = Date.now();
        var length = totalMs || part.durationMs || 0;
        var nearEnd = length > 0 && finalMs >= length - Math.min(length * 0.08, 90000);
        var position = finished || nearEnd || (length > 0 && length < 30000) ? 0 :
            (finalMs >= 3000 ? finalMs : part.resumeMs || 0);
        var episode = ArcTV.episodeOf(work, part.id);
        var copyIds = episode ? episode.copyIds : work.items.map(function (item) { return item.id; });
        copyIds.forEach(function (id) { ArcTV.partOf(work, id).resumeMs = position; });
        part.durationMs = length;
        part.watchedAtMs = now;
        work.watchedAtMs = now;
        work.playId = part.id;
        work.playResumeMs = position;
        if (episode) {
            episode.playId = part.id;
            episode.resumeMs = position;
            episode.durationMs = length;
            episode.watched = position > 0 ? false : (finished || episode.watched);
        }

        if (position > 0) {
            work.resumeId = part.id;
            work.resumeMs = position;
            work.resumeLengthMs = length;
        } else if (copyIds.indexOf(work.resumeId) >= 0) {
            work.resumeId = null;
            work.resumeMs = 0;
            work.resumeLengthMs = 0;
        }
        if (finished) {
            var next = adjacentEpisode(work, part, 1);
            if (next) {
                work.playId = next.playId;
                work.playResumeMs = next.resumeMs;
            }
        }
    }

    function handleKey(event) {
        if (Player.isActive()) {
            Player.handleKey(event);
            event.preventDefault();
            return;
        }

        if (Splash.skip()) {
            event.preventDefault();
            return;
        }

        if (Focus.handleKey(event)) {
            event.preventDefault();
            return;
        }

        if (Platform.isBack(event)) {
            if (DetailScreen.closeSheet() || LibraryScreen.closeSheet()) {
                event.preventDefault();
            } else if (state.screen === 'detail') {
                showLibrary();
                event.preventDefault();
            }
        }
    }

    document.addEventListener('keydown', handleKey);

    Platform.registerKeys();

    goPairing();
})(window);
