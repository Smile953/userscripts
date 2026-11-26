// ==UserScript==
// @name         FetLife Image Saver
// @namespace    http://tampermonkey.net/
// @version      1.7
// @description  Save button on each FetLife image (top right, below the 1/2 counter).
// @author       Community
// @match        https://fetlife.com/*
// @match        https://*.fetlife.com/*
// @grant        GM_xmlhttpRequest
// @connect      fetlife.com
// @connect      cdn.fetlife.com
// @connect      *
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/Smile953/userscripts/main/fetlife-image-saver.user.js
// @downloadURL  https://raw.githubusercontent.com/Smile953/userscripts/main/fetlife-image-saver.user.js
// ==/UserScript==

(function () {
    'use strict';

    function bestSrc(img) {
        const srcset = img.getAttribute('srcset');
        if (srcset) {
            const parts = srcset.split(',').map(s => s.trim().split(/\s+/));
            parts.sort((a, b) => (parseInt(b[1]) || 0) - (parseInt(a[1]) || 0));
            if (parts[0] && parts[0][0]) return parts[0][0];
        }
        return img.currentSrc || img.src;
    }

    const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif' };

    function baseName(url) {
        try {
            return 'fetlife_' + (new URL(url).pathname.split('/').pop() || Date.now());
        } catch (e) {
            return 'fetlife_' + Date.now();
        }
    }

    function saveUrl(src, b) {
        const url = new URL(src, location.href).href;
        console.log('[FLSaver] Fetching', url);
        b.textContent = '…';
        const done = t => { b.textContent = t; setTimeout(() => b.textContent = '⬇', 1500); };
        GM_xmlhttpRequest({
            method: 'GET',
            url,
            responseType: 'blob',
            headers: { Referer: location.href },
            onload: res => {
                if (res.status !== 200 || !res.response) {
                    console.log('[FLSaver] Bad response', res.status);
                    return done('✗');
                }
                const type = (res.response.type || '').split(';')[0];
                const name = baseName(url) + '.' + (EXT[type] || 'jpg');
                saveBlob(res.response, name);
                console.log('[FLSaver] Saved', name);
                done('✓');
            },
            onerror: err => { console.log('[FLSaver] Request failed', err); done('✗'); }
        });
    }

    function saveBlob(blob, name) {
        const a = document.createElement('a');
        const href = URL.createObjectURL(blob);
        a.href = href;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(href), 5000);
    }

    function makeBtn(img) {
        const b = document.createElement('button');
        b.className = 'flsaver-btn';
        b.textContent = '⬇';
        b.title = 'Save image';
        Object.assign(b.style, {
            position: 'absolute', top: '60px', right: '16px', zIndex: 2147483647,
            width: '40px', height: '40px', borderRadius: '50%', border: 'none',
            background: 'rgba(204,0,0,0.9)', color: '#fff', font: 'bold 18px sans-serif',
            cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.5)', padding: '0', lineHeight: '40px'
        });
        ['mousedown', 'pointerdown', 'mouseup', 'pointerup'].forEach(ev =>
            b.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); }, true));
        b.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            console.log('[FLSaver] Click');
            const src = bestSrc(img);
            if (!src || src.startsWith('data:')) { console.log('[FLSaver] No src'); return; }
            saveUrl(src, b);
        }, true);
        return b;
    }

    function scan() {
        document.querySelectorAll('img').forEach(img => {
            const r = img.getBoundingClientRect();
            if (r.width < 200 || r.height < 200) return;
            const host = img.parentElement;
            if (!host) return;
            if (host.querySelector(':scope > .flsaver-btn')) return;
            if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
            host.appendChild(makeBtn(img));
            console.log('[FLSaver] Button added', bestSrc(img));
        });
    }

    scan();
    new MutationObserver(() => { clearTimeout(scan.t); scan.t = setTimeout(scan, 200); })
        .observe(document.documentElement, { childList: true, subtree: true });
    setInterval(scan, 2000);
    console.log('[FLSaver] Loaded v1.7');
})();
