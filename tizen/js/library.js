/*
 * The library: a featured work and a row of cards for each kind of thing on the shelf.
 *
 * The phone hands over works, not files, so a card is a film or a show and the nine copies of one
 * episode live underneath it. The hero is whichever work the household last reached for; its Play
 * button opens the part the phone picked, which is not necessarily the part with the most bytes.
 *
 * Three rails, so the D-pad crosses rows as well as columns: the device pill, the hero's buttons,
 * then one region per rail. Rows stack, so the page scrolls and the topbar is pinned.
 */
(function (global) {
    'use strict';

    // A row of half-watched films longer than this stops being a reminder and becomes a list; the
    // shelf below already holds all of them.
    var CONTINUING_LIMIT = 12;

    var shelf = null;
    var sheet = null;
    var device = null;
    var regions = null;
    var savedRow = 0;

    /**
     * The work this household last reached for, which is how the phone's own rail leads. Ranking by resume
     * position instead picked whichever film was simply longest: a half-watched episode nobody had opened
     * in a week outranked the film watched last night.
     */
    function featuredOf(works) {
        var best = works[0];
        for (var i = 1; i < works.length; i++) {
            if ((works[i].watchedAtMs || 0) > (best.watchedAtMs || 0)) { best = works[i]; }
        }
        return best;
    }

    function plural(count, one, many) {
        return count + ' ' + (count === 1 ? one : many);
    }

    /**
     * The shelf sorted into the three rows a viewer actually thinks in.
     *
     * A work can appear in two of them: "Continue watching" is a reminder, not a category, so a
     * half-watched film also sits in Movies. The phone already answered which part is unfinished by
     * filling in [resumeId], so this only reads that stamp rather than re-deciding anything.
     */
    function railsOf(works) {
        var continuing = [];
        var movies = [];
        var series = [];

        for (var i = 0; i < works.length; i++) {
            var work = works[i];
            if ((work.playResumeMs || 0) > 0) { continuing.push(work); }
            if (work.isSeries) { series.push(work); } else { movies.push(work); }
        }

        continuing.sort(function (a, b) { return (b.watchedAtMs || 0) - (a.watchedAtMs || 0); });
        if (continuing.length > CONTINUING_LIMIT) { continuing.length = CONTINUING_LIMIT; }

        var rows = [];
        if (continuing.length > 0) {
            rows.push({ title: 'Continue watching', count: plural(continuing.length, 'film', 'films'), items: continuing });
        }
        if (movies.length > 0) {
            rows.push({ title: 'Movies', count: plural(movies.length, 'film', 'films'), items: movies });
        }
        if (series.length > 0) {
            rows.push({ title: 'Series', count: plural(series.length, 'show', 'shows'), items: series });
        }
        return rows;
    }

    function runtimeOf(ms) {
        if (!ms) { return ''; }
        var minutes = Math.round(ms / 60000);
        if (minutes < 60) { return minutes + 'm'; }
        var hours = Math.floor(minutes / 60);
        var rest = minutes % 60;
        return hours + 'h' + (rest ? ' ' + rest + 'm' : '');
    }

    /**
     * Facts about the thing that is about to play, which is a part, under a work's name.
     *
     * Runtime, size and resolution belong to one set of bytes; a show card cannot state them, because
     * its next episode is a different file from its last.
     */
    function factsOf(work, part) {
        var parts = [];
        if (work.year) { parts.push(String(work.year)); }
        if (part && part.durationMs) { parts.push(runtimeOf(part.durationMs)); }
        if (part && part.height) { parts.push(part.height + 'p'); }
        if (part && part.sizeBytes) { parts.push(UI.formatSize(part.sizeBytes)); }
        return parts.join('   ·   ');
    }

    function cardFactsOf(work) {
        if (work.isSeries) {
            if (work.seasonCount > 1) { return plural(work.seasonCount, 'season', 'seasons'); }
            return plural(work.partCount, 'episode', 'episodes');
        }
        // A film's parts are its copies, and [partCount] counts the work rather than the files: two
        // uploads of one film is still one part.
        if (work.items.length > 1) { return plural(work.items.length, 'copy', 'copies'); }
        var part = work.items[0];
        return part && part.height ? part.height + 'p' : '';
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

    function buildHero(work, ctx) {
        var hero = UI.el('div', 'hero');

        var bg = UI.el('div', 'hero-bg');
        var backdropUrl = work.backdropUrl || work.posterUrl;
        if (backdropUrl) {
            bg.style.backgroundImage = 'url("' + ArcTV.absolute(ctx.host, backdropUrl) + '")';
            if (!work.backdropUrl) { bg.classList.add('portrait'); }
        }
        hero.appendChild(bg);
        hero.appendChild(UI.el('div', 'hero-lift'));
        hero.appendChild(UI.el('div', 'hero-veil'));

        // The phone already decided which part Play opens; the hero only says so out loud.
        var part = ArcTV.playPartOf(work);
        var resumable = (work.playResumeMs || 0) > 0;

        var body = UI.el('div', 'hero-body');
        var kicker = resumable ? 'Continue watching' :
            (part && part.source === 'telegram' ? 'Streams from Telegram' : 'Downloaded on your phone');
        var naming = ArcTV.partLabelOf(work);
        if (naming) { kicker += ' · ' + naming; }
        body.appendChild(UI.arrive(UI.el('div', 'hero-kicker', kicker), 0));

        body.appendChild(UI.arrive(UI.el('h1', 'hero-title', work.title), 1));

        body.appendChild(UI.arrive(UI.el('div', 'hero-meta', factsOf(work, part)), 2));

        if (work.overview) {
            body.appendChild(UI.arrive(UI.el('p', 'hero-overview', work.overview), 3));
        }

        var chips = UI.el('div', 'hero-chips');
        var genres = work.genres || [];
        for (var i = 0; i < genres.length && i < 3; i++) {
            chips.appendChild(UI.el('span', 'chip', genres[i]));
        }
        if (part && part.audioCodec) {
            chips.appendChild(UI.el('span', 'chip', String(part.audioCodec).toUpperCase()));
        }
        if (part && part.needsRemux) {
            chips.appendChild(UI.el('span', 'chip chip-alert', 'AUDIO UNSUPPORTED'));
        }
        if (chips.firstChild) { body.appendChild(UI.arrive(chips, 4)); }

        var actions = UI.el('div', 'hero-actions');

        var play = UI.el('button', 'button button-primary', resumable ? 'Resume' : 'Play');
        play.addEventListener('click', function () { ctx.onPlay(work); });
        actions.appendChild(play);

        var more = UI.el('button', 'button', 'More info');
        more.addEventListener('click', function () { ctx.onSelect(work); });
        actions.appendChild(more);

        body.appendChild(UI.arrive(actions, 5));
        hero.appendChild(body);

        var focusables = [
            { el: play, onSelect: function () { ctx.onPlay(work); } },
            { el: more, onSelect: function () { ctx.onSelect(work); } }
        ];

        return { el: hero, focusables: focusables };
    }

    function buildCard(work, ctx) {
        var card = UI.el('div', 'card');

        var art = UI.el('div', 'card-art');
        if (work.posterUrl) {
            var img = document.createElement('img');
            img.alt = '';
            // Only the cards on screen ask for a picture. Artwork is now offered for every work on the
            // shelf, and 193 simultaneous image requests is a queue the phone does not need.
            img.loading = 'lazy';
            img.decoding = 'async';
            img.src = ArcTV.absolute(ctx.host, work.posterUrl);
            img.addEventListener('error', function () { art.classList.add('missing'); });
            art.appendChild(img);
        } else {
            art.classList.add('missing');
        }
        art.appendChild(UI.el('div', 'card-fallback', work.title));
        art.appendChild(UI.el('div', 'card-shade'));

        // The warning is about the bytes Play opens, not about the best copy in the group.
        var part = ArcTV.playPartOf(work);
        if (part && part.needsRemux) {
            art.appendChild(UI.el('span', 'chip chip-warn',
                String(part.audioCodec || 'DTS').toUpperCase()));
        }

        if (work.resumeMs > 0 && work.resumeLengthMs > 0) {
            var bar = UI.el('div', 'card-progress');
            var fill = UI.el('div', 'card-progress-fill');
            fill.style.width = Math.min(100, (work.resumeMs / work.resumeLengthMs) * 100) + '%';
            bar.appendChild(fill);
            art.appendChild(bar);
        }

        card.appendChild(art);
        card.appendChild(UI.el('div', 'card-title', work.title));
        card.appendChild(UI.el('div', 'card-meta', cardFactsOf(work)));

        card.addEventListener('click', function () { ctx.onSelect(work); });

        return {
            el: card,
            work: work,
            onSelect: function () { ctx.onSelect(work); }
        };
    }

    function buildRail(rail, ctx) {
        var el = UI.el('div', 'rail');

        var label = UI.el('div', 'rail-label');
        label.appendChild(UI.el('span', 'rail-title', rail.title));
        label.appendChild(UI.el('span', 'rail-count', rail.count));
        el.appendChild(label);

        var track = UI.el('div', 'rail-track');
        var cards = [];
        for (var i = 0; i < rail.items.length; i++) {
            var focusable = buildCard(rail.items[i], ctx);
            track.appendChild(focusable.el);
            cards.push(focusable);
        }
        el.appendChild(track);

        return { el: el, cards: cards };
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

        if (ctx.works.length === 0) {
            container.appendChild(UI.el('div', 'empty', 'Arc Player has no films in this shelf yet.'));
            savedRow = 0;
            Focus.setRegions(regions, { row: 0, onChange: trackFocus });
            return;
        }

        var hero = buildHero(featuredOf(ctx.works), ctx);
        container.appendChild(hero.el);

        // The rails arrive plainly. Only the hero takes a layer: each animated element is a raster of
        // its own on this panel, and a shelf is already busy putting up its own artwork.
        var rails = UI.el('div', 'rails');
        var rows = railsOf(ctx.works);
        var railCards = [];
        for (var r = 0; r < rows.length; r++) {
            var built = buildRail(rows[r], ctx);
            rails.appendChild(built.el);
            railCards.push(built.cards);
        }
        container.appendChild(rails);

        // Coming back from a film page or the player should land on the work you were looking at, not
        // back at the top of the shelf. A half-watched work sits in two rails, so the first rail that
        // holds it wins: that is the row the viewer was reading when they left.
        var startRail = -1;
        var startCard = 0;
        if (ctx.focusWorkKey !== undefined && ctx.focusWorkKey !== null) {
            for (var k = 0; k < railCards.length && startRail < 0; k++) {
                for (var c = 0; c < railCards[k].length; c++) {
                    if (railCards[k][c].work.key === ctx.focusWorkKey) {
                        startRail = k;
                        startCard = c;
                        break;
                    }
                }
            }
        }

        regions = [{ items: [device], columns: 1 }, { items: hero.focusables, columns: 2 }];
        for (var m = 0; m < railCards.length; m++) {
            regions.push({ items: railCards[m], index: m === startRail ? startCard : 0 });
        }

        // Row 0 is the pill and row 1 the hero, so a rail is two rows down from its own index. An
        // unremembered visit starts on the hero, which is where a fresh shelf is read from.
        savedRow = startRail >= 0 ? startRail + 2 : 1;
        Focus.setRegions(regions, { row: savedRow, onChange: trackFocus });
    }

    global.LibraryScreen = { render: render, closeSheet: closeSheet };
})(window);
