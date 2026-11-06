/*
 * Focus management for a D-pad.
 *
 * The interface is a stack of horizontal regions — a hero with its buttons, then a rail of posters
 * per row. Left/right moves inside the current region; up/down crosses to the neighbouring one,
 * keeping the column where it can and clamping where it cannot. A single-region screen (pairing, the
 * film page) is just a stack of one.
 *
 * Written for Chromium M76: no optional chaining, no nullish coalescing.
 */
(function (global) {
    'use strict';

    var state = { regions: [], row: 0, onChange: null };

    function region() { return state.regions[state.row]; }

    /**
     * The nearest ancestor that actually scrolls on one axis.
     *
     * Split by axis because the shelf is a page that scrolls upwards holding rows that scroll
     * sideways: the rail answers for x and the screen answers for y. One search that stopped at the
     * first scrolling ancestor would find the rail and never the page, so the rows below the fold
     * could not be reached.
     */
    function scrollerFor(el, axis) {
        var property = axis === 'x' ? 'overflowX' : 'overflowY';
        var node = el.parentNode;
        while (node && node.nodeType === 1) {
            var value = window.getComputedStyle(node)[property];
            if (value === 'auto' || value === 'scroll') { return node; }
            node = node.parentNode;
        }
        return null;
    }

    function scaleOf(box, frame) {
        var scale = frame.width / box.offsetWidth;
        return scale && isFinite(scale) ? scale : 1;
    }

    /**
     * Scroll `box` just enough to bring `rect` — measured before anything moved — into view.
     *
     * `scrollIntoView` is not usable here: it also scrolls ancestors that merely have
     * `overflow: hidden`, which drags the rail's heading sideways. So the scroll is computed by
     * hand, and divided by the stage scale so it stays correct in the desktop preview where the
     * whole 1920×1080 canvas is scaled down.
     */
    function revealIn(box, rect, horizontal) {
        if (!box) { return; }
        var frame = box.getBoundingClientRect();
        var scale = scaleOf(box, frame);

        if (horizontal) {
            if (box.scrollWidth <= box.clientWidth + 1) { return; }
            // A generous side margin so the neighbouring cards peek in at the rail's edges.
            var padX = 90 * scale;
            if (rect.left < frame.left + padX) {
                box.scrollLeft -= (frame.left + padX - rect.left) / scale;
            } else if (rect.right > frame.right - padX) {
                box.scrollLeft += (rect.right - (frame.right - padX)) / scale;
            }
            return;
        }

        if (box.scrollHeight <= box.clientHeight + 1) { return; }
        // The top margin clears the pinned bar over the shelf; the bottom one leaves a hint of the
        // next row, so it reads as a page that continues rather than one that ends.
        var padTop = 132 * scale;
        var padBottom = 40 * scale;
        if (rect.top < frame.top + padTop) {
            box.scrollTop -= (frame.top + padTop - rect.top) / scale;
        } else if (rect.bottom > frame.bottom - padBottom) {
            box.scrollTop += (rect.bottom - (frame.bottom - padBottom)) / scale;
        }
    }

    function reveal(el) {
        // Measured once per axis: the sideways scroll moves the rectangle, and the vertical pass has
        // to know where the card ended up afterwards.
        revealIn(scrollerFor(el, 'x'), el.getBoundingClientRect(), true);
        revealIn(scrollerFor(el, 'y'), el.getBoundingClientRect(), false);
    }

    function apply() {
        if (state.regions.length === 0) { return; }

        for (var r = 0; r < state.regions.length; r++) {
            var reg = state.regions[r];
            for (var i = 0; i < reg.items.length; i++) {
                var item = reg.items[i];
                if (!item || !item.el) { continue; }
                if (r === state.row && i === reg.index) { item.el.classList.add('focused'); }
                else { item.el.classList.remove('focused'); }
            }
        }

        var active = region().items[region().index];
        if (active && active.el) { reveal(active.el); }
        if (state.onChange) { state.onChange(state.row, region().index, active); }
    }

    function setRegions(regions, options) {
        options = options || {};

        var built = [];
        for (var i = 0; i < regions.length; i++) {
            var reg = regions[i];
            if (!reg || !reg.items || reg.items.length === 0) { continue; }
            var index = reg.index || 0;
            if (index >= reg.items.length) { index = reg.items.length - 1; }
            built.push({
                items: reg.items,
                index: index,
                columns: reg.columns || reg.items.length
            });
        }

        state = { regions: built, row: 0, onChange: options.onChange || null };
        if (built.length === 0) { return; }

        if (typeof options.row === 'number' && options.row < built.length) {
            state.row = options.row;
        }
        apply();
    }

    function set(items, options) {
        options = options || {};
        setRegions([{ items: items, columns: options.columns || items.length }], options);
    }

    function move(dx, dy) {
        if (state.regions.length === 0) { return; }

        var reg = region();
        var index = reg.index;

        if (dx !== 0) {
            var horizontal = index + dx;
            if (horizontal >= 0 && horizontal < reg.items.length) { index = horizontal; }
        }

        if (dy !== 0) {
            var target = state.row + dy;
            if (target >= 0 && target < state.regions.length) {
                var next = state.regions[target];
                // Keep the column where the next region is wide enough; clamp where it is not.
                var column = index;
                if (column >= next.items.length) { column = next.items.length - 1; }
                next.index = column;
                state.row = target;
                apply();
                return;
            }
        }

        if (index !== reg.index) {
            reg.index = index;
            apply();
        }
    }

    function activate() {
        if (state.regions.length === 0) { return; }
        var active = region().items[region().index];
        if (active && active.onSelect) { active.onSelect(active); }
    }

    function current() {
        if (state.regions.length === 0) { return null; }
        return region().items[region().index] || null;
    }

    function reset() { state = { regions: [], row: 0, onChange: null }; }

    function handleKey(event) {
        var code = event.keyCode;
        if (code === 37) { move(-1, 0); return true; }
        if (code === 39) { move(1, 0); return true; }
        if (code === 38) { move(0, -1); return true; }
        if (code === 40) { move(0, 1); return true; }
        if (code === 13) { activate(); return true; }
        return false;
    }

    global.Focus = {
        set: set,
        setRegions: setRegions,
        move: move,
        activate: activate,
        current: current,
        reset: reset,
        handleKey: handleKey
    };
})(window);
