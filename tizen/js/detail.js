/*
 * The film page: artwork, facts, and one obvious action.
 *
 * The poster fills the screen as a blurred backdrop; the sharp copy sits on top of it with the
 * artwork itself on the left, so the page feels like it belongs to the film rather than to a form.
 */
(function (global) {
    'use strict';

    function factsOf(item) {
        var facts = [];
        if (item.year) { facts.push(String(item.year)); }
        if (item.durationMs) { facts.push(UI.formatTime(item.durationMs)); }
        if (item.height) { facts.push(item.height + 'p'); }
        if (item.bitrateMbps) { facts.push(item.bitrateMbps.toFixed(1) + ' Mbps'); }
        if (item.sizeBytes) { facts.push(UI.formatSize(item.sizeBytes)); }
        return facts.join('   ·   ');
    }

    function render(container, ctx) {
        UI.clear(container);

        var item = ctx.item;
        var posterUrl = item.posterUrl ? ArcTV.absolute(ctx.host, item.posterUrl) : '';
        var backdropUrl = item.backdropUrl ? ArcTV.absolute(ctx.host, item.backdropUrl) : posterUrl;

        var wrap = UI.el('div', 'detail');

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
        art.appendChild(UI.el('div', 'detail-poster-fallback', item.title));
        body.appendChild(art);

        var info = UI.el('div', 'detail-info');
        info.appendChild(UI.el('h1', 'detail-title', item.title));
        info.appendChild(UI.el('div', 'detail-meta', factsOf(item)));

        var chips = UI.el('div', 'detail-chips');
        var genres = item.genres || [];
        for (var i = 0; i < genres.length && i < 3; i++) {
            chips.appendChild(UI.el('span', 'chip', genres[i]));
        }
        if (item.audioCodec) {
            chips.appendChild(UI.el('span', 'chip', String(item.audioCodec).toUpperCase()));
        }
        if (item.height >= 2160) {
            chips.appendChild(UI.el('span', 'chip', '4K'));
        }
        if (chips.firstChild) { info.appendChild(chips); }

        if (item.overview) {
            info.appendChild(UI.el('p', 'detail-overview', item.overview));
        }

        if (item.resumeMs > 0 && item.durationMs > 0) {
            var share = Math.min(100, (item.resumeMs / item.durationMs) * 100);

            var resume = UI.el('div', 'detail-resume');
            var bar = UI.el('div', 'resume-bar');
            var fill = UI.el('div', 'resume-fill');
            fill.style.width = share + '%';
            bar.appendChild(fill);
            resume.appendChild(bar);
            resume.appendChild(UI.el('span', null, 'Resume at ' + UI.formatTime(item.resumeMs)));
            info.appendChild(resume);
        }

        if (item.needsRemux) {
            info.appendChild(UI.el('div', 'detail-warning',
                'This film carries ' + String(item.audioCodec || 'DTS').toUpperCase() +
                ' audio, which this TV cannot decode. The picture always plays, but you may hear' +
                ' nothing unless the file also holds an AC-3 or AAC track. Re-encode the audio to' +
                ' AAC on a computer to fix it.'));
        }

        var play = UI.el('button', 'button button-primary',
            item.resumeMs > 0 ? 'Resume' : 'Play');
        play.addEventListener('click', function () { ctx.onPlay(item); });
        info.appendChild(play);

        body.appendChild(info);
        wrap.appendChild(body);
        container.appendChild(wrap);

        Focus.set([{ el: play, onSelect: function () { ctx.onPlay(item); } }], { columns: 1 });
    }

    global.DetailScreen = { render: render };
})(window);
