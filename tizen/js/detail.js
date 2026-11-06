/* Episode rows use the phone's copy verdict; only the visible page is mounted. */
(function (global) {
    'use strict';

    function factsOf(work, part, label) {
        var facts = [];
        if (label) { facts.push(label); }
        if (work.year) { facts.push(String(work.year)); }
        if (part.durationMs) { facts.push(UI.formatTime(part.durationMs)); }
        if (part.height) { facts.push(part.height + 'p'); }
        if (part.bitrateMbps) { facts.push(part.bitrateMbps.toFixed(1) + ' Mbps'); }
        if (part.sizeBytes) { facts.push(UI.formatSize(part.sizeBytes)); }
        return facts.join('   ·   ');
    }

    var PAGE_SIZE = 12;
    var view = { key: null, season: null, page: 0, row: 0, index: 0 };
    var sheet = null;
    var restoreFocus = null;
    var entering = false;

    function closeSheet() {
        if (!sheet) { return false; }
        sheet.parentNode.removeChild(sheet);
        sheet = null;
        if (restoreFocus) { restoreFocus(); }
        return true;
    }

    function copyFacts(part) {
        var facts = [];
        if (part.height) { facts.push(part.height + 'p'); }
        if (part.audioCodec) { facts.push(String(part.audioCodec).toUpperCase()); }
        if (part.sizeBytes) { facts.push(UI.formatSize(part.sizeBytes)); }
        facts.push(part.source === 'local' ? 'On phone' : 'Telegram');
        if (part.needsRemux) { facts.push('Audio may not play'); }
        return facts.join(' · ');
    }

    function button(text, className, action) {
        var el = UI.el('button', className, text);
        el.type = 'button';
        el.addEventListener('click', action);
        return { el: el, onSelect: action };
    }

    function openCopies(container, ctx, ids, resumeMs) {
        var dialog = UI.el('div', 'detail-copy-sheet');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-label', 'Choose a copy');
        dialog.appendChild(UI.el('h2', 'detail-section-title', 'Choose a copy'));
        dialog.appendChild(UI.el('p', 'detail-copy-note', 'Same title, different file · Back closes'));
        var list = UI.el('div', 'detail-copy-list');
        var rows = [];
        ids.forEach(function (id) {
            var part = ArcTV.partOf(ctx.work, id);
            if (!part) { return; }
            var item = button('', 'detail-copy-option', function () {
                closeSheet();
                ctx.onPlayPart(part, resumeMs);
            });
            item.el.appendChild(UI.el('span', 'detail-copy-name', part.fileName));
            item.el.appendChild(UI.el('span', 'detail-copy-meta', copyFacts(part)));
            rows.push({ items: [item] });
            list.appendChild(item.el);
        });
        dialog.appendChild(list);
        sheet = UI.el('div', 'detail-copy-backdrop');
        sheet.appendChild(dialog);
        container.appendChild(sheet);
        Focus.setRegions(rows);
    }

    function addEpisodes(container, wrap, ctx, actions) {
        var work = ctx.work;
        var episodes = work.episodes || [];
        var sections = [{ items: actions, index: view.row === 0 ? view.index : 0 }];
        var section = UI.el('div', 'detail-episodes');
        section.appendChild(UI.el('h2', 'detail-section-title', 'Episodes'));
        var seasons = [];
        episodes.forEach(function (episode) {
            if (seasons.indexOf(episode.season) < 0) { seasons.push(episode.season); }
        });
        seasons.sort(function (a, b) { return a - b; });
        if (seasons.indexOf(view.season) < 0) {
            var aimed = ArcTV.episodeOf(work, work.playId);
            view.season = aimed ? aimed.season : seasons[0];
            view.page = 0;
            if (aimed) {
                var sameSeason = episodes.filter(function (entry) { return entry.season === view.season; });
                view.page = Math.floor(sameSeason.indexOf(aimed) / PAGE_SIZE);
            }
        }
        var tabs = UI.el('div', 'detail-seasons');
        var seasonButtons = [];
        seasons.forEach(function (season) {
            var item = button(season === 0 ? 'Specials' : 'Season ' + season, 'button season-button', function () {
                view.season = season;
                view.page = 0;
                view.row = 1;
                view.index = seasons.indexOf(season);
                render(container, ctx);
            });
            item.el.setAttribute('aria-pressed', season === view.season ? 'true' : 'false');
            if (season === view.season) { item.el.classList.add('selected'); }
            tabs.appendChild(item.el);
            seasonButtons.push(item);
        });
        section.appendChild(tabs);
        if (seasonButtons.length) {
            sections.push({ items: seasonButtons, index: seasons.indexOf(view.season) });
        }
        var available = episodes.filter(function (entry) { return entry.season === view.season; });
        view.page = Math.min(view.page, Math.max(0, Math.ceil(available.length / PAGE_SIZE) - 1));
        var watched = available.filter(function (entry) { return entry.watched; }).length;
        section.appendChild(UI.el('p', 'detail-season-summary', available.length +
            ' episodes available · ' + watched + ' watched'));
        if (!available.length) {
            section.appendChild(UI.el('p', 'detail-season-summary', 'No episodes available on this phone.'));
        }
        available.slice(view.page * PAGE_SIZE, (view.page + 1) * PAGE_SIZE).forEach(function (episode) {
            var part = ArcTV.partOf(work, episode.playId);
            if (!part) { return; }
            var row = UI.el('div', 'episode-row');
            var regionIndex = sections.length;
            var play = button('', 'episode-play', function () {
                view.row = regionIndex;
                view.index = 0;
                ctx.onPlayPart(part, episode.resumeMs);
            });
            play.el.appendChild(UI.el('span', 'episode-number', String(episode.episode)));
            var info = UI.el('span', 'episode-info');
            info.appendChild(UI.el('span', 'episode-title', 'Episode ' + episode.episode));
            info.appendChild(UI.el('span', 'episode-meta', copyFacts(part)));
            if (episode.resumeMs > 0 && episode.durationMs > 0) {
                var track = UI.el('span', 'episode-progress');
                var fill = UI.el('span', 'episode-progress-fill');
                fill.style.width = Math.min(100, episode.resumeMs / episode.durationMs * 100) + '%';
                track.appendChild(fill);
                info.appendChild(track);
            }
            play.el.appendChild(info);
            var status = episode.resumeMs > 0 ? 'Resume ' + UI.formatTime(episode.resumeMs) :
                (episode.watched ? 'Watched' : 'Play');
            if (episode.copyIds.indexOf(work.playId) >= 0) { status = 'Up next · ' + status; }
            var ending = UI.el('span', 'episode-ending');
            ending.appendChild(UI.el('span', 'episode-state', status));
            if (episode.durationMs > 0) {
                ending.appendChild(UI.el('span', 'episode-meta', UI.formatTime(episode.durationMs)));
            }
            play.el.appendChild(ending);
            row.appendChild(play.el);
            var rowItems = [play];
            if (episode.copyIds.length > 1) {
                var copies = button(episode.copyIds.length + ' copies', 'button episode-copies', function () {
                    view.row = regionIndex;
                    view.index = 1;
                    openCopies(container, ctx, episode.copyIds, episode.resumeMs);
                });
                copies.el.setAttribute('aria-label', 'Copies of episode ' + episode.episode);
                row.appendChild(copies.el);
                rowItems.push(copies);
            }
            section.appendChild(row);
            sections.push({ items: rowItems, index: sections.length === view.row ? view.index : 0 });
        });
        if (available.length > PAGE_SIZE) {
            var pages = UI.el('div', 'detail-pages');
            var pageItems = [];
            function pageButton(text, delta) {
                var item = button(text, 'button', function () {
                    view.page += delta;
                    // -1 means "stay where I am": the paging row is always last, but its index is only
                    // known once the next page's rows have been built.
                    view.row = -1;
                    view.index = 0;
                    render(container, ctx);
                });
                pages.appendChild(item.el);
                pageItems.push(item);
            }
            if (view.page > 0) { pageButton('Previous page', -1); }
            pages.appendChild(UI.el('span', 'detail-page-count', (view.page + 1) + ' / ' + Math.ceil(available.length / PAGE_SIZE)));
            if ((view.page + 1) * PAGE_SIZE < available.length) { pageButton('More episodes', 1); }
            section.appendChild(pages);
            sections.push({ items: pageItems });
        }
        wrap.appendChild(section);
        return sections;
    }

    function render(container, ctx) {
        closeSheet();
        UI.clear(container);
        entering = view.key !== ctx.work.key;
        if (entering) {
            view = { key: ctx.work.key, season: null, page: 0, row: 0, index: 0 };
            container.scrollTop = 0;
        }

        var work = ctx.work;
        // The part Play is about to open. Its facts stand in for the work's wherever the page talks
        // about bytes, because a show has no single length, resolution or bitrate.
        var part = ctx.part || (work.items ? work.items[0] : null) || {};
        var label = ArcTV.partLabelOf(work);

        var posterUrl = work.posterUrl ? ArcTV.absolute(ctx.host, work.posterUrl) : '';
        var backdropUrl = work.backdropUrl ? ArcTV.absolute(ctx.host, work.backdropUrl) : posterUrl;

        var wrap = UI.el('div', work.isSeries ? 'detail detail-series' : 'detail');

        var bg = UI.el('div', 'detail-bg');
        if (backdropUrl) { bg.style.backgroundImage = 'url("' + backdropUrl + '")'; }
        wrap.appendChild(bg);
        wrap.appendChild(UI.el('div', 'detail-lift'));
        wrap.appendChild(UI.el('div', 'detail-veil'));

        var top = UI.el('div', 'detail-top');
        var brand = UI.el('div', 'brand');
        brand.appendChild(UI.el('span', 'brand-mark'));
        brand.appendChild(UI.el('span', 'brand-name', 'ArcTV'));
        top.appendChild(brand);
        top.appendChild(UI.el('div', 'detail-back', 'BACK returns to the library'));
        wrap.appendChild(top);

        var body = UI.el('div', 'detail-body');

        var art = UI.el('div', 'detail-poster');
        if (posterUrl) {
            var img = document.createElement('img');
            img.alt = '';
            img.src = posterUrl;
            img.addEventListener('error', function () { art.classList.add('missing'); });
            art.appendChild(img);
        } else {
            art.classList.add('missing');
        }
        art.appendChild(UI.el('div', 'detail-poster-fallback', work.title));
        body.appendChild(art);

        var info = UI.el('div', 'detail-info');
        info.appendChild(UI.el('h1', 'detail-title', work.title));
        info.appendChild(UI.el('div', 'detail-meta', factsOf(work, part, label)));

        var chips = UI.el('div', 'detail-chips');
        var genres = work.genres || [];
        for (var i = 0; i < genres.length && i < 3; i++) {
            chips.appendChild(UI.el('span', 'chip', genres[i]));
        }
        if (work.isSeries) {
            chips.appendChild(UI.el('span', 'chip',
                work.seasonCount > 1 ? work.seasonCount + ' seasons' : work.partCount + ' episodes'));
        } else if (work.items.length > 1) {
            // [partCount] counts the work, not its files: two uploads of one film is one part.
            chips.appendChild(UI.el('span', 'chip', work.items.length + ' copies'));
        }
        if (part.audioCodec) {
            chips.appendChild(UI.el('span', 'chip', String(part.audioCodec).toUpperCase()));
        }
        if (part.height >= 2160) {
            chips.appendChild(UI.el('span', 'chip', '4K'));
        }
        if (part.source === 'telegram') {
            chips.appendChild(UI.el('span', 'chip', 'TELEGRAM'));
        }
        if (chips.firstChild) { info.appendChild(chips); }

        if (work.overview) {
            info.appendChild(UI.el('p', 'detail-overview', work.overview));
        }

        if (work.playResumeMs > 0 && part.durationMs > 0) {
            var share = Math.min(100, (work.playResumeMs / part.durationMs) * 100);

            var resume = UI.el('div', 'detail-resume');
            var bar = UI.el('div', 'resume-bar');
            var fill = UI.el('div', 'resume-fill');
            fill.style.width = share + '%';
            bar.appendChild(fill);
            resume.appendChild(bar);
            resume.appendChild(UI.el('span', null, 'Resume at ' + UI.formatTime(work.playResumeMs)));
            info.appendChild(resume);
        }

        if (part.needsRemux) {
            info.appendChild(UI.el('div', 'detail-warning',
                'This film carries ' + String(part.audioCodec || 'DTS').toUpperCase() +
                ' audio, which this TV cannot decode. The picture always plays, but you may hear' +
                ' nothing unless the file also holds an AC-3 or AAC track. Re-encode the audio to' +
                ' AAC on a computer to fix it.'));
        }

        var actions = [];
        var actionBar = UI.el('div', 'detail-actions');
        var play = button((work.playResumeMs || 0) > 0 ? 'Resume' : 'Play', 'button button-primary',
            function () { ctx.onPlay(work); });
        actionBar.appendChild(play.el);
        actions.push(play);
        if (work.playResumeMs > 0) {
            var restart = button('Start over', 'button', function () { ctx.onPlayPart(part, 0); });
            actionBar.appendChild(restart.el);
            actions.push(restart);
        }
        if (!work.isSeries && work.items.length > 1) {
            var copies = button('Copies', 'button', function () {
                openCopies(container, ctx, work.items.map(function (item) { return item.id; }), work.playResumeMs || 0);
            });
            actionBar.appendChild(copies.el);
            actions.push(copies);
        }
        info.appendChild(actionBar);
        body.appendChild(info);

        /*
         * The page arrives from the top down: the poster first, then each line beside it in the order
         * it is read. Only a genuine arrival choreographs — paging and changing season rebuild this
         * same page, and replaying the glide there reads as the TV struggling rather than arriving.
         */
        if (entering) {
            UI.arrive(art, 0);
            for (var a = 0; a < info.children.length; a++) { UI.arrive(info.children[a], a + 1); }
        }

        wrap.appendChild(body);
        var regions = work.isSeries ? addEpisodes(container, wrap, ctx, actions) : [{ items: actions }];
        container.appendChild(wrap);
        restoreFocus = function () {
            var row = view.row < 0 ? regions.length - 1 : Math.min(view.row, regions.length - 1);
            regions[row].index = Math.min(view.index, regions[row].items.length - 1);
            Focus.setRegions(regions, { row: row, onChange: function (r, index) {
                view.row = r;
                view.index = index;
            } });
        };
        restoreFocus();
    }

    global.DetailScreen = { render: render, closeSheet: closeSheet };
})(window);
