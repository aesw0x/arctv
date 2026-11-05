/*
 * The library: a featured hero and one horizontal rail.
 *
 * The hero is whichever film was watched most recently, falling back to the first in the shelf.
 * The rail is everything, scrolling sideways under the remote. Two focus regions, so the D-pad
 * moves between the hero's buttons and the posters.
 */
(function (global) {
    'use strict';

    var shelf = null;
    var sheet = null;
    var device = null;
    var regions = null;
    var savedRow = 0;

    function featuredOf(items) {
        var best = items[0];
        for (var i = 1; i < items.length; i++) {
            if ((items[i].resumeMs || 0) > (best.resumeMs || 0)) { best = items[i]; }
        }
        return best;
    }

    function runtimeOf(ms) {
        if (!ms) { return ''; }
        var minutes = Math.round(ms / 60000);
        if (minutes < 60) { return minutes + 'm'; }
        var hours = Math.floor(minutes / 60);
        var rest = minutes % 60;
        return hours + 'h' + (rest ? ' ' + rest + 'm' : '');
    }

    function factsOf(item) {
        var parts = [];
        if (item.year) { parts.push(String(item.year)); }
        if (item.durationMs) { parts.push(runtimeOf(item.durationMs)); }
        if (item.height) { parts.push(item.height + 'p'); }
        if (item.sizeBytes) { parts.push(UI.formatSize(item.sizeBytes)); }
        return parts.join('   ·   ');
    }

    function cardFactsOf(item) {
        var parts = [];
        if (item.year) { parts.push(String(item.year)); }
        if (item.height) { parts.push(item.height + 'p'); }
        return parts.join('   ·   ');
    }

    function buildTopbar(ctx) {
        var bar = UI.el('div', 'topbar');

        var brand = UI.el('div', 'brand');
        brand.appendChild(UI.el('span', 'brand-mark'));
        brand.appendChild(UI.el('span', 'brand-name', 'ArcTV'));
        bar.appendChild(brand);

        var status = UI.el('div', 'status-pill');
        status.appendChild(UI.el('span', 'status-dot'));
        status.appendChild(UI.el('span', null, ctx.deviceName || ctx.host));
        status.appendChild(UI.el('span', 'status-caret', '\u2304'));
        bar.appendChild(status);

        return { el: bar, device: { el: status, onSelect: function () { toggleSheet(ctx); } } };
    }

    /*
     * The phone's name is the only way in and out of this pairing, so it is a control rather than a
     * label: up from the hero focuses it, OK opens the sheet, and Back closes it without leaving the
     * shelf. Both actions land on the device list; only "forget" also drops the token.
     */
    function buildOption(label, meta, onSelect) {
        var row = UI.el('div', 'device-option');
        row.appendChild(UI.el('div', 'device-option-label', label));
        if (meta) { row.appendChild(UI.el('div', 'device-option-meta', meta)); }
        row.addEventListener('click', onSelect);
        return { el: row, onSelect: onSelect };
    }

    function removeSheet() {
        if (!sheet) { return; }
        if (sheet.parentNode) { sheet.parentNode.removeChild(sheet); }
        sheet = null;
    }

    function openSheet(ctx) {
        if (sheet) { return; }

        sheet = UI.el('div', 'device-sheet');

        var heading = UI.el('div', 'device-sheet-heading');
        heading.appendChild(UI.el('div', 'device-sheet-title', ctx.deviceName || ctx.host));
        heading.appendChild(UI.el('div', 'device-sheet-note', 'Back closes'));
        sheet.appendChild(heading);

        var options = UI.el('div', 'device-sheet-options');
        var items = [
            buildOption('Switch phone', 'Find another phone on this Wi-Fi', function () {
                removeSheet();
                ctx.onSwitchPhone();
            }),
            buildOption('Forget this phone', ctx.host, function () {
                removeSheet();
                ctx.onForgetPhone();
            })
        ];
        for (var i = 0; i < items.length; i++) { options.appendChild(items[i].el); }
        sheet.appendChild(options);

        shelf.appendChild(sheet);

        // One region per row, because up and down travel between regions here. The pill is kept in
        // the map above the options, so up from the first option lands back on it and OK there
        // closes the sheet again.
        var map = [{ items: [device], columns: 1 }];
        for (var j = 0; j < items.length; j++) { map.push({ items: [items[j]], columns: 1 }); }
        Focus.setRegions(map, { row: 1 });
    }

    function toggleSheet(ctx) {
        if (sheet) { closeSheet(); return; }
        openSheet(ctx);
    }

    function closeSheet() {
        if (!sheet) { return false; }
        removeSheet();
        Focus.setRegions(regions, { row: savedRow });
        return true;
    }

    function buildHero(item, ctx) {
        var hero = UI.el('div', 'hero');

        var bg = UI.el('div', 'hero-bg');
        var backdropUrl = item.backdropUrl || item.posterUrl;
        if (backdropUrl) {
            bg.style.backgroundImage = 'url("' + ArcTV.absolute(ctx.host, backdropUrl) + '")';
            if (!item.backdropUrl) { bg.classList.add('portrait'); }
        }
        hero.appendChild(bg);
        hero.appendChild(UI.el('div', 'hero-lift'));
        hero.appendChild(UI.el('div', 'hero-veil'));

        var body = UI.el('div', 'hero-body');
        body.appendChild(UI.el('div', 'hero-kicker',
            item.resumeMs > 0 ? 'Continue watching' : 'Downloaded on your phone'));

        var title = UI.el('h1', 'hero-title', item.title);
        body.appendChild(title);

        body.appendChild(UI.el('div', 'hero-meta', factsOf(item)));

        if (item.overview) {
            body.appendChild(UI.el('p', 'hero-overview', item.overview));
        }

        var chips = UI.el('div', 'hero-chips');
        var genres = item.genres || [];
        for (var i = 0; i < genres.length && i < 3; i++) {
            chips.appendChild(UI.el('span', 'chip', genres[i]));
        }
        if (item.audioCodec) {
            chips.appendChild(UI.el('span', 'chip', String(item.audioCodec).toUpperCase()));
        }
        if (item.needsRemux) {
            chips.appendChild(UI.el('span', 'chip chip-alert', 'AUDIO UNSUPPORTED'));
        }
        if (chips.firstChild) { body.appendChild(chips); }

        var actions = UI.el('div', 'hero-actions');

        var play = UI.el('button', 'button button-primary', item.resumeMs > 0 ? 'Resume' : 'Play');
        play.addEventListener('click', function () { ctx.onPlay(item); });
        actions.appendChild(play);

        var more = UI.el('button', 'button', 'More info');
        more.addEventListener('click', function () { ctx.onSelect(item); });
        actions.appendChild(more);

        body.appendChild(actions);
        hero.appendChild(body);

        var focusables = [
            { el: play, onSelect: function () { ctx.onPlay(item); } },
            { el: more, onSelect: function () { ctx.onSelect(item); } }
        ];

        return { el: hero, focusables: focusables };
    }

    function buildCard(item, ctx) {
        var card = UI.el('div', 'card');

        var art = UI.el('div', 'card-art');
        if (item.posterUrl) {
            var img = document.createElement('img');
            img.alt = '';
            img.src = ArcTV.absolute(ctx.host, item.posterUrl);
            img.addEventListener('error', function () { art.classList.add('missing'); });
            art.appendChild(img);
        } else {
            art.classList.add('missing');
        }
        art.appendChild(UI.el('div', 'card-fallback', item.title));
        art.appendChild(UI.el('div', 'card-shade'));

        if (item.needsRemux) {
            art.appendChild(UI.el('span', 'chip chip-warn',
                String(item.audioCodec || 'DTS').toUpperCase()));
        }

        if (item.resumeMs > 0 && item.durationMs > 0) {
            var bar = UI.el('div', 'card-progress');
            var fill = UI.el('div', 'card-progress-fill');
            fill.style.width = Math.min(100, (item.resumeMs / item.durationMs) * 100) + '%';
            bar.appendChild(fill);
            art.appendChild(bar);
        }

        card.appendChild(art);
        card.appendChild(UI.el('div', 'card-title', item.title));
        card.appendChild(UI.el('div', 'card-meta', cardFactsOf(item)));

        card.addEventListener('click', function () { ctx.onSelect(item); });

        return {
            el: card,
            item: item,
            onSelect: function () { ctx.onSelect(item); }
        };
    }

    function trackFocus(row, index) {
        if (regions[row]) { regions[row].index = index; }
        savedRow = row;
    }

    function render(container, ctx) {
        UI.clear(container);
        removeSheet();
        shelf = container;

        var topbar = buildTopbar(ctx);
        container.appendChild(topbar.el);
        device = topbar.device;
        regions = [{ items: [device], columns: 1 }];

        if (ctx.items.length === 0) {
            container.appendChild(UI.el('div', 'empty', 'Arc Player has no films in this shelf yet.'));
            savedRow = 0;
            Focus.setRegions(regions, { row: 0, onChange: trackFocus });
            return;
        }

        var hero = buildHero(featuredOf(ctx.items), ctx);
        container.appendChild(hero.el);

        var rails = UI.el('div', 'rails');
        var rail = UI.el('div', 'rail');

        var label = UI.el('div', 'rail-label');
        label.appendChild(UI.el('span', 'rail-title', 'On your phone'));
        label.appendChild(UI.el('span', 'rail-count',
            ctx.items.length + (ctx.items.length === 1 ? ' film' : ' films')));
        rail.appendChild(label);

        var track = UI.el('div', 'rail-track');
        var cards = [];
        for (var i = 0; i < ctx.items.length; i++) {
            var focusable = buildCard(ctx.items[i], ctx);
            track.appendChild(focusable.el);
            cards.push(focusable);
        }
        rail.appendChild(track);
        rails.appendChild(rail);
        container.appendChild(rails);

        // Coming back from a film page or the player should land on the film you were looking at,
        // not back at the top of the shelf.
        var startCard = 0;
        var remembered = false;
        if (ctx.focusItemId !== undefined && ctx.focusItemId !== null) {
            for (var k = 0; k < cards.length; k++) {
                if (cards[k].item.id === ctx.focusItemId) { startCard = k; remembered = true; break; }
            }
        }

        regions = [
            { items: [device], columns: 1 },
            { items: hero.focusables, columns: 2 },
            { items: cards, index: startCard }
        ];
        savedRow = remembered ? 2 : 1;
        Focus.setRegions(regions, { row: savedRow, onChange: trackFocus });
    }

    global.LibraryScreen = { render: render, closeSheet: closeSheet };
})(window);
