// ==UserScript==
// @name         X Video Downloader
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Adds a download button on X videos and saves the highest-quality MP4 (page-level API hook).
// @author       Community
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        GM_xmlhttpRequest
// @connect      video.twimg.com
// @connect      *
// @run-at       document-start
// @sandbox      DOM
// @updateURL    https://raw.githubusercontent.com/Smile953/userscripts/main/x-video-downloader.user.js
// @downloadURL  https://raw.githubusercontent.com/Smile953/userscripts/main/x-video-downloader.user.js
// ==/UserScript==

(function () {
    'use strict';

    const byMedia = new Map(); // mediaId -> mp4 url
    const byTweet = new Map(); // tweetId -> mp4 url

    // ---- 1. Hook that runs inside the X page itself ----
    const pageHook = function () {
        function bestMp4(vi) {
            if (!vi || !vi.variants) return null;
            const best = vi.variants
                .filter(v => v.content_type === 'video/mp4')
                .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
            return best ? best.url : null;
        }
        function collect(obj, tid, out) {
            if (!obj || typeof obj !== 'object') return;
            if (Array.isArray(obj)) { for (const o of obj) collect(o, tid, out); return; }
            const myTid = (obj.legacy && obj.rest_id) ? obj.rest_id
                        : (obj.extended_entities && obj.id_str) ? obj.id_str : tid;
            if (obj.video_info) {
                const url = bestMp4(obj.video_info);
                if (url) {
                    const ids = [];
                    if (obj.id_str) ids.push(obj.id_str);
                    if (obj.media_key) ids.push(String(obj.media_key).split('_').pop());
                    const m = String(obj.media_url_https || '').match(/(\d{10,})/);
                    if (m) ids.push(m[1]);
                    out.push({ ids, tid: myTid, url });
                }
            }
            for (const k in obj) collect(obj[k], myTid, out);
        }
        function handle(text) {
            if (!text || (text[0] !== '{' && text[0] !== '[')) return;
            if (text.indexOf('video_info') === -1) return;
            try {
                const out = [];
                collect(JSON.parse(text), null, out);
                if (out.length) window.postMessage({ __xvid: true, items: out }, '*');
            } catch (e) {}
        }

        const origOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function () {
            this.addEventListener('load', function () {
                try {
                    if (this.responseType === '' || this.responseType === 'text') handle(this.responseText);
                    else if (this.responseType === 'json') handle(JSON.stringify(this.response));
                } catch (e) {}
            });
            return origOpen.apply(this, arguments);
        };

        const origFetch = window.fetch;
        window.fetch = function () {
            const p = origFetch.apply(this, arguments);
            p.then(r => {
                const ct = (r.headers && r.headers.get('content-type')) || '';
                if (ct.includes('json')) r.clone().text().then(handle).catch(() => {});
            }).catch(() => {});
            return p;
        };

        // Data that was already embedded in the page on load
        function scanInline() {
            document.querySelectorAll('script:not([src])').forEach(s => {
                const t = s.textContent || '';
                if (t.indexOf('video_info') === -1) return;
                const i = t.indexOf('{');
                const j = t.lastIndexOf('}');
                if (i >= 0 && j > i) handle(t.slice(i, j + 1));
            });
        }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scanInline);
        else scanInline();
    };

    // ---- 2. Inject hook into the page ----
    const s = document.createElement('script');
    s.textContent = '(' + pageHook + ')();';
    (document.documentElement || document.head || document.body).appendChild(s);
    s.remove();

    // ---- 3. Receive items from the page hook ----
    window.addEventListener('message', e => {
        const d = e.data;
        if (!d || !d.__xvid || !d.items) return;
        for (const it of d.items) {
            for (const id of it.ids) if (id) byMedia.set(id, it.url);
            if (it.tid) byTweet.set(it.tid, it.url);
        }
        console.log('[XVid] Known videos:', byMedia.size);
    });

    // ---- Find the right MP4 for a <video> ----
    function mediaIdOf(video) {
        const m = (video.getAttribute('poster') || '').match(/(?:amplify_video_thumb|ext_tw_video_thumb|tweet_video_thumb)\/(\d+)/);
        return m ? m[1] : null;
    }

    function tweetIdNear(video) {
        let node = video;
        for (let i = 0; i < 25 && node; i++) {
            const a = node.querySelector && node.querySelector('a[href*="/status/"]');
            if (a) {
                const m = a.getAttribute('href').match(/\/status\/(\d+)/);
                if (m) return m[1];
            }
            node = node.parentElement;
        }
        const m = location.pathname.match(/\/status\/(\d+)/);
        return m ? m[1] : null;
    }

    function urlFor(video) {
        const mid = mediaIdOf(video);
        if (mid && byMedia.has(mid)) return { url: byMedia.get(mid), name: mid };
        const tid = tweetIdNear(video);
        if (tid && byTweet.has(tid)) return { url: byTweet.get(tid), name: tid };
        const src = video.currentSrc || video.src || '';
        if (src.startsWith('https://video.twimg.com') && src.includes('.mp4')) return { url: src, name: mid || Date.now() };
        console.log('[XVid] No URL found. mediaId:', mid, 'tweetId:', tid, 'known media:', [...byMedia.keys()]);
        return null;
    }

    // ---- 4. Download ----
    function flash(btn, text) {
        btn.textContent = text;
        setTimeout(() => btn.textContent = '⬇', 1800);
    }

    function download(btn, info) {
        btn.textContent = '…';
        console.log('[XVid] Fetching', info.url);
        GM_xmlhttpRequest({
            method: 'GET',
            url: info.url,
            responseType: 'blob',
            onload: res => {
                if (res.status !== 200 || !res.response) { console.log('[XVid] Bad response', res.status); flash(btn, '✗'); return; }
                const a = document.createElement('a');
                const href = URL.createObjectURL(res.response);
                a.href = href;
                a.download = `x_${info.name}.mp4`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(href), 10000);
                flash(btn, '✓');
            },
            onerror: err => { console.log('[XVid] Request failed', err); flash(btn, '✗'); }
        });
    }

    // ---- 5. Button on each video ----
    function addButtons() {
        document.querySelectorAll('video').forEach(video => {
            if (video.dataset.xvid) return;
            const host = video.parentElement;
            if (!host) return;
            video.dataset.xvid = '1';
            if (getComputedStyle(host).position === 'static') host.style.position = 'relative';

            const btn = document.createElement('button');
            btn.textContent = '⬇';
            btn.title = 'Download video';
            Object.assign(btn.style, {
                position: 'absolute', top: '8px', right: '8px', zIndex: 50,
                width: '34px', height: '34px', borderRadius: '9999px', border: 'none',
                background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: '17px',
                cursor: 'pointer', pointerEvents: 'auto'
            });
            ['pointerdown', 'mousedown', 'mouseup'].forEach(ev =>
                btn.addEventListener(ev, e => e.stopPropagation(), true));
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                const info = urlFor(video);
                if (!info) { flash(btn, '?'); return; }
                download(btn, info);
            }, true);
            host.appendChild(btn);
        });
    }

    function start() {
        new MutationObserver(addButtons).observe(document.body, { childList: true, subtree: true });
        addButtons();
        console.log('[XVid] Loaded v1.2');
    }
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start);
})();
