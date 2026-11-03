/*
 * Small DOM and formatting helpers.
 */
(function (global) {
    'use strict';

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) { node.className = className; }
        if (text !== undefined && text !== null) { node.textContent = text; }
        return node;
    }

    function clear(node) {
        while (node.firstChild) { node.removeChild(node.firstChild); }
    }

    function pad(value) { return value < 10 ? '0' + value : String(value); }

    function formatTime(ms) {
        if (!ms || ms < 0) { ms = 0; }
        var total = Math.floor(ms / 1000);
        var hours = Math.floor(total / 3600);
        var minutes = Math.floor((total % 3600) / 60);
        var seconds = total % 60;
        if (hours > 0) { return hours + ':' + pad(minutes) + ':' + pad(seconds); }
        return minutes + ':' + pad(seconds);
    }

    function formatSize(bytes) {
        if (!bytes) { return ''; }
        var gb = bytes / (1024 * 1024 * 1024);
        if (gb >= 1) { return gb.toFixed(1) + ' GB'; }
        return Math.round(bytes / (1024 * 1024)) + ' MB';
    }

    global.UI = {
        el: el,
        clear: clear,
        formatTime: formatTime,
        formatSize: formatSize
    };
})(window);
