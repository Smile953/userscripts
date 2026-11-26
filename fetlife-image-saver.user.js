// ==UserScript==
// @name         FetLife Image Saver
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Fixed Save button that downloads the biggest visible image on FetLife.
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

    function bgUrl(el) {
        const m = getComputedStyle(el).backgroundImage.match(/url\(["']?(.*?)["']?\)/);
        return m ? m[1] : null;
    }

    function biggestVisible() {
        let best = null, area = 0;
        document.querySelectorAll('img, div, a, span, picture').forEach(el => {
            const url = el.tagName === 'IMG' ? bestSrc(el) : bgUrl(el);
            if (!url || url.startsWith('data:')) return;
            const r = el.getBoundingClientRect();
            if (r.bottom < 0 || r.top > innerHeight || r.width < 100 || r.height < 100) return;
            const a = r.width * r.height;
            if (a > area) { area = a; best = url; }
        });
        return best;
    }

    const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif' };

    function baseName(url) {
        try {
            return 'fetlife_' + (new URL(url).pathname.split('/').pop() || Date.now());
        } catch (e) {
            return 'fetlife_' + Date.now();
        }
    }

    function flash(text) {
        btn.textContent = text;
        setTimeout(() => btn.textContent = '⬇ Save', 1500);
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

    const btn = document.createElement('button');
    btn.textContent = '⬇ Save';
    Object.assign(btn.style, {
        position: 'fixed', bottom: '20px', right: '20px', zIndex: 2147483647,
        padding: '10px 14px', borderRadius: '8px', border: 'none',
        background: '#c00', color: '#fff', font: 'bold 14px sans-serif',
        cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.5)'
    });

    btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        const src = biggestVisible();
        if (!src) { console.log('[FLSaver] No image found'); flash('No image'); return; }
        const url = new URL(src, location.href).href;
        console.log('[FLSaver] Fetching', url);
        btn.textContent = '…';

        GM_xmlhttpRequest({
            method: 'GET',
            url,
            responseType: 'blob',
            headers: { Referer: location.href },
            onload: res => {
                if (res.status !== 200 || !res.response) {
                    console.log('[FLSaver] Bad response', res.status);
                    flash('Failed');
                    return;
                }
                const type = (res.response.type || '').split(';')[0];
                const name = baseName(url) + '.' + (EXT[type] || 'jpg');
                saveBlob(res.response, name);
                console.log('[FLSaver] Saved', name);
                flash('✓ Saved');
            },
            onerror: err => {
                console.log('[FLSaver] Request failed', err);
                flash('Failed');
            }
        });
    }, true);

    (document.body || document.documentElement).appendChild(btn);
    console.log('[FLSaver] Loaded v1.4');
})();
