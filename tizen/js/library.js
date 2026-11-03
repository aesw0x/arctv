/*
 * The library: a featured hero and one horizontal rail.
 *
 * The hero is whichever film was watched most recently, falling back to the first in the shelf.
 * The rail is everything, scrolling sideways under the remote. Two focus regions, so the D-pad
 * moves between the hero's buttons and the posters.
 */
(function (global) {
    'use strict';

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
        bar.appendChild(status);

        return bar;
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
            art.appendChild(UI.el('span', 'chip chip-warn', 'DTS'));
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

    function render(container, ctx) {
        UI.clear(container);

        container.appendChild(buildTopbar(ctx));

        if (ctx.items.length === 0) {
            container.appendChild(UI.el('div', 'empty', 'Arc Player has no films in this shelf yet.'));
            Focus.reset();
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

        Focus.setRegions([
            { items: hero.focusables, columns: 2 },
            { items: cards, index: startCard }
        ], { row: remembered ? 1 : 0 });
    }

    global.LibraryScreen = { render: render };
})(window);
