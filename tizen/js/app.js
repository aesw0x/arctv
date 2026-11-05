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
        items: [],
        item: null
    };

    var screens = {
        pairing: document.getElementById('screen-pairing'),
        library: document.getElementById('screen-library'),
        detail: document.getElementById('screen-detail')
    };

    function show(name) {
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
        state.items = [];
        state.item = null;
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
            state.items = (payload && payload.items) ? payload.items : [];
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
        screens.library.appendChild(wrap);

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
            items: state.items,
            focusItemId: state.item ? state.item.id : null,
            onSelect: showDetail,
            onPlay: function (item) { playItem(item, showLibrary); },
            onSwitchPhone: switchPhone,
            onForgetPhone: forgetPhone
        });
    }

    function showDetail(item) {
        state.screen = 'detail';
        state.item = item;
        show('detail');
        DetailScreen.render(screens.detail, {
            host: state.host,
            item: item,
            onPlay: function (chosen) { playItem(chosen, showDetail); }
        });
    }

    /**
     * The library, the film page and the hero all start playback the same way, so the resume
     * point is written back to the shared item object once and every screen agrees on it.
     */
    function playItem(item, onClose) {
        state.item = item;
        Player.open({
            host: state.host,
            item: item,
            startMs: item.resumeMs || 0,
            onClose: function (finalMs) {
                if (finalMs > 0) {
                    var nearEnd = item.durationMs && finalMs > item.durationMs - 30000;
                    item.resumeMs = nearEnd ? 0 : finalMs;
                    item.watchedAtMs = Date.now();
                }
                if (onClose) { onClose(item); }
            }
        });
    }

    function handleKey(event) {
        if (Player.isActive()) {
            Player.handleKey(event);
            event.preventDefault();
            return;
        }

        if (Focus.handleKey(event)) {
            event.preventDefault();
            return;
        }

        if (event.keyCode === 10009 || event.keyCode === 27) {
            if (LibraryScreen.closeSheet()) {
                event.preventDefault();
            } else if (state.screen === 'detail') {
                showLibrary();
                event.preventDefault();
            }
        }
    }

    document.addEventListener('keydown', handleKey);

    if (global.tizen && global.tizen.tvinputdevice && global.tizen.tvinputdevice.registerKey) {
        ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop',
            'MediaFastForward', 'MediaRewind'].forEach(function (key) {
            try { global.tizen.tvinputdevice.registerKey(key); } catch (ignored) { /* ignore */ }
        });
    }

    goPairing();
})(window);
