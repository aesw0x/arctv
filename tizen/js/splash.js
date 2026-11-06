/*
 * The launch mark.
 *
 * The phone draws its launcher icon stroke by stroke, closes the clapper and lets the mark go before it
 * asks the home for a frame. This is that schedule on the panel, and the drawing itself lives in CSS:
 * five `stroke-dashoffset` transitions and three keyframe animations, so no JavaScript ever runs a
 * frame loop on a device that pays for every one.
 *
 * What it holds back is the part that matters. A screen the app reaches for while the curtain is up is
 * queued, not shown, so the shelf stays `display:none` for the whole intro — nothing paints under the
 * mark, and the animations a screen is built from do not start until it is actually on screen. The
 * phone learned this the hard way: heavy work competing with the mark shows up as skipped frames, not
 * slowed ones. Here the only work allowed to run behind the curtain is the network, which costs no
 * frames at all and is why the intro reads as time found rather than time added.
 */
(function (global) {
    'use strict';

    /*
     * The curtain's own duration, and it has to agree with css/app.css: the strokes are finished at 860,
     * the clap settles by 1320, the mark recedes across 1360-1760 and 120ms of bare black follows. A
     * reduced-motion mark is simply drawn, so it needs far less of it.
     */
    var RELEASE_MS = 1880;
    var REDUCED_RELEASE_MS = 600;

    var node = document.getElementById('splash');
    var queued = null;
    var live = !!node;

    function reducedMotion() {
        return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    function release() {
        if (!live) { return; }
        live = false;
        if (node.parentNode) { node.parentNode.removeChild(node); }
        node = null;

        var pending = queued;
        queued = null;
        if (pending) { pending(); }
    }

    /**
     * Take a screen change if the mark is still up, and return whether it was taken.
     *
     * Only the last one asked for is kept: it is the screen the app has actually reached, and applying
     * the earlier ones would only have painted something the viewer never sees.
     */
    function hold(apply) {
        if (!live) { return false; }
        queued = apply;
        return true;
    }

    /**
     * One key ends the intro, and the queued screen goes up in that same press.
     *
     * Nobody should wait for a schedule they did not ask for — and a curtain that can only be lifted by
     * a timer is a curtain that can strand the app if that timer is ever lost.
     */
    function skip() {
        if (!live) { return false; }
        release();
        return true;
    }

    function start() {
        if (!live) { return; }

        // The release timer is armed before anything is touched, so a failure in the drawing setup can
        // only ever cost the drawing, never the screen.
        global.setTimeout(release, reducedMotion() ? REDUCED_RELEASE_MS : RELEASE_MS);

        void node.offsetWidth;
        global.setTimeout(function () {
            node.classList.add('is-inking');
        }, 0);
    }

    global.Splash = {
        hold: hold,
        skip: skip,
        running: function () { return live; }
    };

    start();
})(window);
