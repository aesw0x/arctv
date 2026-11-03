/*
 * The interface is drawn on a fixed 1920×1080 canvas, because that is what a Tizen web app is
 * laid out at: the platform scales the surface, not the type. On the television this computes a
 * scale of exactly 1 and clears the transform entirely.
 *
 * Clearing it matters: any transform, even scale(1), promotes the whole 1920×1080 stage to its
 * own compositing layer on the TV, so every focus change re-rasterises two million pixels. Only
 * the desktop preview needs the transform at all.
 *
 * It exists so the same build can be reviewed in a desktop window of any size, where it would
 * otherwise clip. It is not responsive design and is not meant to be.
 */
(function (global) {
    'use strict';

    var WIDTH = 1920;
    var HEIGHT = 1080;

    function fit() {
        var stage = document.getElementById('stage');
        if (!stage) { return; }
        var scale = Math.min(
            global.innerWidth / WIDTH,
            global.innerHeight / HEIGHT
        );
        stage.style.transform = scale === 1 ? '' : 'scale(' + scale + ')';
    }

    global.addEventListener('resize', fit);
    document.addEventListener('DOMContentLoaded', fit);
    fit();
})(window);
