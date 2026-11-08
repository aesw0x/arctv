/*
 * Device list and pairing.
 *
 * The TV can see that an Arc Player exists on the LAN, but it cannot read the library until the
 * phone says yes. Choosing a device asks the phone to show a prompt; this screen just polls
 * until it is answered.
 */
(function (global) {
    'use strict';

    var POLL_MS = 2000;
    var pollTimer = null;

    function stop() {
        if (pollTimer) {
            clearTimeout(pollTimer);
            pollTimer = null;
        }
    }

    function buildBrand(className) {
        var brand = UI.el('div', 'brand ' + className);
        brand.appendChild(UI.el('span', 'brand-mark'));
        brand.appendChild(UI.el('span', 'brand-name', 'ArcTV'));
        return brand;
    }

    function buildDots() {
        var dots = UI.el('div', 'scanning');
        dots.appendChild(UI.el('span'));
        dots.appendChild(UI.el('span'));
        dots.appendChild(UI.el('span'));
        return dots;
    }

    function render(container, ctx, screenOptions) {
        screenOptions = screenOptions || {};
        stop();
        UI.clear(container);

        container.appendChild(buildBrand('pair-brand'));

        var title = UI.el('h1', 'screen-title', 'Choose your phone');
        var subtitle = UI.el('p', 'screen-subtitle', 'Scanning your Wi-Fi for Arc Player…');
        var dots = buildDots();
        var list = UI.el('div', 'device-list');

        container.appendChild(title);
        container.appendChild(subtitle);
        container.appendChild(dots);
        container.appendChild(list);

        function showDevices(found, wider) {
            UI.clear(list);
            dots.classList.add('hidden');

            if (found.length === 0) {
                title.textContent = 'No phone found';
                subtitle.textContent =
                    'Open Arc Player on your phone, on the same Wi-Fi as this TV.';
                var retry = UI.el('button', 'button', 'Search again');
                retry.addEventListener('click', function () { scan(); });
                list.appendChild(UI.arrive(retry, 0));
                // `Focus.activate` hands the item to `onSelect`, so a bare `scan` would read it as
                // the flag and turn a plain retry into a full sweep. Bind the call, not the name.
                Focus.set([{ el: retry, onSelect: function () { scan(); } }], { columns: 1 });
                return;
            }

            title.textContent = 'Choose your phone';
            subtitle.textContent = found.length === 1
                ? 'Found one device. Press OK to connect.'
                : 'Found ' + found.length + ' devices. Choose one.';

            var items = [];
            found.forEach(function (device, index) {
                var row = UI.el('div', 'device-row');
                row.appendChild(UI.el('div', 'device-icon'));

                var text = UI.el('div', 'device-text');
                text.appendChild(UI.el('div', 'device-name', device.info.device || device.host));
                text.appendChild(UI.el('div', 'device-address',
                    device.host + '   ·   port ' + device.port));
                row.appendChild(text);

                row.appendChild(UI.el('div', 'device-chevron', '\u203A'));

                row.addEventListener('click', function () { choose(device); });
                // The list is what the scan was waiting for, so it is the thing that arrives; the
                // heading above it has been on screen the whole time and must not move.
                list.appendChild(UI.arrive(row, index, { each: 55 }));
                items.push({ el: row, device: device, onSelect: function () { choose(device); } });
            });

            // The shortcut that gets a returning viewer onto their phone fastest is also the one
            // that can hide a second phone: a saved address that still answers ends the search
            // before the network is swept. So when the list came from that shortcut, offer the
            // wider look.
            if (wider) {
                var more = UI.el('button', 'button device-more', 'Look for other phones');
                more.addEventListener('click', function () { scan(true); });
                list.appendChild(UI.arrive(more, found.length, { each: 55 }));
                items.push({ el: more, onSelect: function () { scan(true); } });
            }

            Focus.set(items, { columns: 1 });
        }

        function choose(device) {
            stop();

            var label = device.info.device || device.host;
            var token = ArcTV.tokenFor(device.host);
            if (token) {
                ctx.onPaired(device.host, token, label);
                return;
            }

            UI.clear(list);
            title.textContent = 'Waiting for approval';
            subtitle.textContent = 'Asking ' + label + ' for permission…';

            var codeBox = UI.el('div', 'pair-code', '\u00b7\u00b7\u00b7\u00b7\u00b7\u00b7');
            list.appendChild(codeBox);

            var hint = UI.el('p', 'screen-subtitle', 'A prompt should appear on your phone. Press Allow.');
            list.appendChild(hint);

            Focus.reset();

            ArcTV.requestPairing(device.host, 'TV').then(function (result) {
                codeBox.textContent = result.code;
                // The dots held the shape of a code for as long as the phone had not answered; the
                // digits that replace it land, rather than appearing mid-frame.
                codeBox.classList.add('arrive-settle');
                poll(device.host, codeBox.textContent, subtitle, hint, label);
            }).catch(function () {
                subtitle.textContent = label + ' did not answer.';
                hint.textContent = 'Press the back button and try again.';
            });
        }

        function poll(host, code, statusLine, hint, name) {
            ArcTV.pairStatus(host, code).then(function (status) {
                if (!status) { schedule(); return; }

                if (status.state === 'approved') {
                    ArcTV.saveToken(host, status.token, name);
                    ctx.onPaired(host, status.token, name);
                    return;
                }
                if (status.state === 'denied') {
                    statusLine.textContent = 'This TV was denied on your phone.';
                    hint.textContent = 'Press the back button to choose another device.';
                    return;
                }
                if (status.state === 'expired' || status.state === 'unknown') {
                    statusLine.textContent = 'The code expired.';
                    hint.textContent = 'Press the back button and try again.';
                    return;
                }
                schedule();
            }).catch(function () {
                schedule();
            });

            function schedule() {
                pollTimer = setTimeout(function () {
                    poll(host, code, statusLine, hint, name);
                }, POLL_MS);
            }
        }

        function scan(all) {
            stop();
            title.textContent = 'Choose your phone';
            subtitle.textContent = 'Scanning your Wi-Fi for Arc Player…';
            dots.classList.remove('hidden');
            UI.clear(list);
            Focus.reset();

            var full = !!(all || screenOptions.scanAll);
            ArcTV.discover(null, { skipSaved: full }).then(function (found) {
                showDevices(found, !full);
            });
        }

        scan();
    }

    global.PairingScreen = { render: render, stop: stop };
})(window);
