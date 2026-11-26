// ==UserScript==
// @name         Grok Imagine - Thumbnails Scroll Down on Failed Generation
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Scrolls the left thumbnail list back down when a generation fails or is moderated.
// @author       Community
// @match        https://grok.com/imagine*
// @match        https://www.grok.com/imagine*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/Smile953/userscripts/main/grok-imagine-thumbnail-scroll.user.js
// @downloadURL  https://raw.githubusercontent.com/Smile953/userscripts/main/grok-imagine-thumbnail-scroll.user.js
// ==/UserScript==

(function () {
    'use strict';

    // Teksten die op een mislukte generatie wijzen (pas aan indien nodig)
    const FAIL_TEXTS = [
        'content moderated',
        'generation failed',
        'failed to generate',
        'something went wrong',
        'mislukt'
    ];
    let lastTrigger = 0;

    // Zoek de scrollbare lijst aan de linkerkant met de meeste afbeeldingen
    function findThumbList() {
        let best = null;
        let bestCount = 0;
        document.querySelectorAll('body *').forEach(el => {
            if (el.scrollHeight <= el.clientHeight + 20) return;
            const cs = getComputedStyle(el);
            if (!/(auto|scroll)/.test(cs.overflowY)) return;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.left > window.innerWidth / 3) return; // alleen linkerkant
            const count = el.querySelectorAll('img, video').length;
            if (count > bestCount) {
                best = el;
                bestCount = count;
            }
        });
        return best;
    }

    function scrollThumbsDown() {
        const list = findThumbList();
        if (!list) {
            console.log('[ThumbScroll] Geen miniaturenlijst gevonden');
            return;
        }
        list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
        console.log('[ThumbScroll] Lijst omlaag gescrold', list);
    }

    function onFailure() {
        const now = Date.now();
        if (now - lastTrigger < 1500) return;
        lastTrigger = now;
        // Een paar keer proberen, want Grok scrollt soms zelf nog na
        [150, 600, 1200].forEach(ms => setTimeout(scrollThumbsDown, ms));
    }

    function nodeHasFailText(node) {
        if (node.nodeType !== 1 && node.nodeType !== 3) return false;
        const txt = (node.textContent || '').toLowerCase();
        return FAIL_TEXTS.some(t => txt.includes(t));
    }

    const observer = new MutationObserver(mutations => {
        for (const m of mutations) {
            for (const n of m.addedNodes) {
                if (nodeHasFailText(n)) {
                    console.log('[ThumbScroll] Mislukte generatie gedetecteerd');
                    onFailure();
                    return;
                }
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    console.log('[ThumbScroll] Loaded on /imagine');
})();
