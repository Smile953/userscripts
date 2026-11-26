// ==UserScript==
// @name         X Video Downloader
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Adds a download button on X videos and saves the highest-quality MP4 (page hook + API fallback).
// @author       Community
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      video.twimg.com
// @connect      cdn.syndication.twimg.com
// @connect      api.x.com
// @connect      api.twitter.com
// @connect      api.fxtwitter.com
// @connect      x.com
// @connect      twitter.com
// @connect      *
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/Smile953/userscripts/main/x-video-downloader.user.js
// @downloadURL  https://raw.githubusercontent.com/Smile953/userscripts/main/x-video-downloader.user.js
// ==/UserScript==

(function () {
    'use strict';

    const VERSION = '1.4';
    const byMedia = new Map(); // mediaId -> mp4 url
    const byTweet = new Map(); // tweetId -> mp4 url
    const BEARER = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
    const GQL_IDS = [
        'U8lc5aomF5krJzZ9vJ9wxg',
        'GZsN2Pc4knAoit6pXa4HSA',
        'tCVRZ3WCvoj0BVO7BKnL-Q',
        'WvlrBJ2bz8AuwoszWyie8A'
    ];

    function bestMp4(vi) {
        const variants = Array.isArray(vi) ? vi : (vi && vi.variants);
        if (!variants || !variants.length) return null;
        const best = variants
            .filter(v => v && (v.content_type === 'video/mp4' || (v.url && /\.mp4(\?|$)/.test(v.url))) && !/\.m3u8(\?|$)/.test(v.url || ''))
            .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
        return best ? best.url : null;
    }

    function collect(obj, tweetId, out, seen) {
        if (!obj || typeof obj !== 'object') return;
        if (!seen) seen = new Set();
        if (seen.has(obj)) return;
        seen.add(obj);
        if (Array.isArray(obj)) { obj.forEach(o => collect(o, tweetId, out, seen)); return; }

        const tid = (obj.legacy && obj.rest_id) ? obj.rest_id
            : (obj.extended_entities && obj.id_str) ? obj.id_str
            : (obj.id_str && (obj.full_text !== undefined || obj.legacy || obj.video)) ? obj.id_str
            : (obj.tweetID || obj.tweet_id || tweetId);

        if (obj.video_info) {
            const url = bestMp4(obj.video_info);
            if (url) remember(obj, tid, url, out);
        } else if (obj.variants && (obj.type === 'video' || obj.type === 'animated_gif' || obj.video_info === undefined)) {
            const url = bestMp4(obj);
            if (url) remember(obj, tid, url, out);
        } else if (obj.video && obj.video.variants) {
            const url = bestMp4(obj.video);
            if (url) remember(obj, tid, url, out);
        } else if (Array.isArray(obj.formats)) {
            const url = bestMp4(obj.formats);
            if (url) remember(obj, tid, url, out);
        }

        // Nested quoted / retweeted tweets (walk everything)
        for (const k in obj) {
            if (k === 'quoted_status_permalink' || k === 'user') continue;
            collect(obj[k], tid, out, seen);
        }
    }

    function remember(obj, tid, url, out) {
        const ids = [];
        if (obj.id_str) ids.push(obj.id_str);
        if (obj.id && /^\d{10,}$/.test(String(obj.id))) ids.push(String(obj.id));
        if (obj.media_id) ids.push(String(obj.media_id));
        if (obj.media_key) ids.push(String(obj.media_key).split('_').pop());
        const m = String(obj.media_url_https || obj.media_url || obj.thumbnail_url || obj.poster || '').match(/(\d{15,})/);
        if (m) ids.push(m[1]);
        out.push({ ids, tid, url });
    }

    function ingestItems(items, source) {
        let added = 0;
        for (const it of items) {
            for (const id of it.ids || []) {
                if (id && !byMedia.has(id)) { byMedia.set(id, it.url); added++; }
                else if (id) byMedia.set(id, it.url);
            }
            if (it.tid) byTweet.set(it.tid, it.url);
        }
        console.log('[XVid] Ingested', items.length, 'item(s) from', source, '- known media:', byMedia.size, [...byMedia.keys()]);
        return added;
    }

    function pickFromItems(items, mediaId, tweetId) {
        if (!items || !items.length) return null;
        if (mediaId) {
            const hit = items.find(it => (it.ids || []).includes(mediaId));
            if (hit) return { url: hit.url, tweetId: hit.tid || tweetId, mediaId };
        }
        if (tweetId) {
            const hit = items.find(it => it.tid === tweetId);
            if (hit) return { url: hit.url, tweetId, mediaId: (hit.ids || [])[0] || mediaId };
        }
        const first = items[0];
        return { url: first.url, tweetId: first.tid || tweetId, mediaId: (first.ids || [])[0] || mediaId };
    }

    // ---- 1. Hook that runs inside the X page itself ----
    const pageHook = function () {
        if (window.__xvidHooked) return;
        window.__xvidHooked = true;
        console.log('[XVid] Page hook installed');

        function bestMp4(vi) {
            const variants = Array.isArray(vi) ? vi : (vi && vi.variants);
            if (!variants || !variants.length) return null;
            const best = variants
                .filter(v => v && (v.content_type === 'video/mp4' || (v.url && /\.mp4(\?|$)/.test(v.url))) && !/\.m3u8(\?|$)/.test(v.url || ''))
                .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
            return best ? best.url : null;
        }
        function remember(obj, tid, url, out) {
            const ids = [];
            if (obj.id_str) ids.push(obj.id_str);
            if (obj.id && /^\d{10,}$/.test(String(obj.id))) ids.push(String(obj.id));
            if (obj.media_id) ids.push(String(obj.media_id));
            if (obj.media_key) ids.push(String(obj.media_key).split('_').pop());
            const m = String(obj.media_url_https || obj.media_url || obj.thumbnail_url || obj.poster || '').match(/(\d{15,})/);
            if (m) ids.push(m[1]);
            out.push({ ids, tid, url });
        }
        function collect(obj, tweetId, out, seen) {
            if (!obj || typeof obj !== 'object') return;
            if (!seen) seen = new Set();
            if (seen.has(obj)) return;
            seen.add(obj);
            if (Array.isArray(obj)) { obj.forEach(o => collect(o, tweetId, out, seen)); return; }
            const tid = (obj.legacy && obj.rest_id) ? obj.rest_id
                : (obj.extended_entities && obj.id_str) ? obj.id_str
                : (obj.id_str && (obj.full_text !== undefined || obj.legacy || obj.video)) ? obj.id_str
                : (obj.tweetID || obj.tweet_id || tweetId);
            if (obj.video_info) {
                const url = bestMp4(obj.video_info);
                if (url) remember(obj, tid, url, out);
            } else if (obj.variants) {
                const url = bestMp4(obj);
                if (url) remember(obj, tid, url, out);
            } else if (obj.video && obj.video.variants) {
                const url = bestMp4(obj.video);
                if (url) remember(obj, tid, url, out);
            }
            for (const k in obj) {
                if (k === 'user') continue;
                collect(obj[k], tid, out, seen);
            }
        }
        function handle(text, source) {
            if (!text || (text[0] !== '{' && text[0] !== '[')) return;
            if (text.indexOf('video_info') === -1 && text.indexOf('video/mp4') === -1) return;
            try {
                const out = [];
                collect(JSON.parse(text), null, out);
                if (out.length) window.postMessage({ __xvid: true, items: out, source: source || 'hook' }, '*');
            } catch (e) {}
        }

        function wrapFetch() {
            const orig = window.fetch;
            if (!orig || orig.__xvid) return;
            const hooked = function () {
                const p = orig.apply(this, arguments);
                try {
                    const req = arguments[0];
                    const url = String((req && req.url) || req || '');
                    p.then(r => {
                        const ct = (r.headers && r.headers.get('content-type')) || '';
                        if (ct.includes('json') || /graphql|tweet-result|TweetResult/i.test(url)) {
                            r.clone().text().then(t => handle(t, 'fetch')).catch(() => {});
                        }
                    }).catch(() => {});
                } catch (e) {}
                return p;
            };
            hooked.__xvid = true;
            try {
                let current = hooked;
                Object.defineProperty(window, 'fetch', {
                    configurable: true,
                    enumerable: true,
                    get() { return current; },
                    set(v) {
                        if (v && v.__xvid) { current = v; return; }
                        // X replaced fetch — wrap the new implementation too
                        const inner = v;
                        const rehook = function () {
                            const p = inner.apply(this, arguments);
                            try {
                                const req = arguments[0];
                                const url = String((req && req.url) || req || '');
                                p.then(r => {
                                    const ct = (r.headers && r.headers.get('content-type')) || '';
                                    if (ct.includes('json') || /graphql|tweet-result|TweetResult/i.test(url)) {
                                        r.clone().text().then(t => handle(t, 'fetch')).catch(() => {});
                                    }
                                }).catch(() => {});
                            } catch (e) {}
                            return p;
                        };
                        rehook.__xvid = true;
                        current = rehook;
                        console.log('[XVid] Re-wrapped window.fetch after page overwrite');
                    }
                });
            } catch (e) {
                window.fetch = hooked;
            }
        }

        function wrapXHR() {
            const proto = XMLHttpRequest.prototype;
            if (proto.open.__xvid) return;
            const origOpen = proto.open;
            proto.open = function () {
                const url = String(arguments[1] || '');
                this.addEventListener('load', function () {
                    try {
                        if (this.responseType === '' || this.responseType === 'text') handle(this.responseText, 'xhr');
                        else if (this.responseType === 'json') handle(JSON.stringify(this.response), 'xhr');
                    } catch (e) {}
                });
                return origOpen.apply(this, arguments);
            };
            proto.open.__xvid = true;
        }

        wrapFetch();
        wrapXHR();
        setInterval(() => { wrapFetch(); wrapXHR(); }, 1500);

        function scanInline() {
            document.querySelectorAll('script:not([src])').forEach(s => {
                const t = s.textContent || '';
                if (t.indexOf('video_info') === -1) return;
                const i = t.indexOf('{');
                const j = t.lastIndexOf('}');
                if (i >= 0 && j > i) handle(t.slice(i, j + 1), 'inline');
            });
        }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scanInline);
        else scanInline();
    };

    // ---- 2. Inject hook into the page as early as possible ----
    function injectHook() {
        try {
            const s = document.createElement('script');
            s.textContent = '(' + pageHook + ')();';
            const root = document.documentElement || document.head || document.body;
            if (!root) return false;
            root.appendChild(s);
            s.remove();
            console.log('[XVid] Injected page hook via script tag');
            return true;
        } catch (e) {
            console.log('[XVid] Script-tag injection failed (CSP?)', e);
            return false;
        }
    }

    if (!injectHook()) {
        document.addEventListener('DOMContentLoaded', injectHook);
    }
    try {
        if (typeof unsafeWindow !== 'undefined' && unsafeWindow) {
            const hooker = '(' + pageHook + ')();';
            try {
                unsafeWindow.eval(hooker);
                console.log('[XVid] Hooked via unsafeWindow.eval');
            } catch (e1) {
                // Fall back to applying against the page window's constructors
                const F = unsafeWindow.Function;
                if (F) {
                    F(hooker)();
                    console.log('[XVid] Hooked via unsafeWindow.Function');
                }
            }
        }
    } catch (e) {
        console.log('[XVid] unsafeWindow hook failed', e);
    }

    // ---- 3. Receive items from the page hook ----
    window.addEventListener('message', e => {
        const d = e.data;
        if (!d || !d.__xvid || !d.items) return;
        ingestItems(d.items, d.source || 'page-hook');
    });

    // ---- Find the right MP4 for a <video> ----
    function mediaIdOf(video) {
        const attrs = [
            video.getAttribute('poster') || '',
            video.getAttribute('src') || '',
            video.currentSrc || ''
        ].join(' ');
        const m = attrs.match(/(?:amplify_video_thumb|ext_tw_video_thumb|tweet_video_thumb|amplify_video|ext_tw_video)\/(\d+)/);
        return m ? m[1] : null;
    }

    function tweetIdNear(video) {
        const ids = [];
        let node = video;
        for (let i = 0; i < 25 && node; i++) {
            const links = node.querySelectorAll ? node.querySelectorAll('a[href*="/status/"]') : [];
            links.forEach(a => {
                const m = (a.getAttribute('href') || '').match(/\/status\/(\d+)/);
                if (m && !ids.includes(m[1])) ids.push(m[1]);
            });
            if (node.getAttribute) {
                const href = node.getAttribute('href') || '';
                const m = href.match(/\/status\/(\d+)/);
                if (m && !ids.includes(m[1])) ids.push(m[1]);
            }
            node = node.parentElement;
        }
        const m = location.pathname.match(/\/status\/(\d+)/);
        if (m && !ids.includes(m[1])) ids.push(m[1]);
        return ids;
    }

    function urlFor(video) {
        const mid = mediaIdOf(video);
        const tids = tweetIdNear(video);
        if (mid && byMedia.has(mid)) return { url: byMedia.get(mid), tweetId: tids[0] || mid, mediaId: mid };
        for (const tid of tids) {
            if (byTweet.has(tid)) return { url: byTweet.get(tid), tweetId: tid, mediaId: mid };
        }
        const src = video.currentSrc || video.src || '';
        if (src.startsWith('https://video.twimg.com') && src.includes('.mp4')) {
            return { url: src, tweetId: tids[0] || mid || String(Date.now()), mediaId: mid };
        }
        return null;
    }

    function cookie(name) {
        const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[$()*+./?[\\\]^{|}]/g, '\\$&') + '=([^;]*)'));
        return m ? decodeURIComponent(m[1]) : null;
    }

    function gmRequest(opts) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: opts.method || 'GET',
                url: opts.url,
                headers: opts.headers || {},
                responseType: opts.responseType || 'text',
                timeout: opts.timeout || 20000,
                onload: resolve,
                onerror: err => reject(err || new Error('GM request failed')),
                ontimeout: () => reject(new Error('GM request timed out'))
            });
        });
    }

    function syndicationToken(id) {
        return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
    }

    function isTombstone(obj) {
        if (!obj || typeof obj !== 'object') return false;
        if (obj.__typename && /Tombstone/i.test(obj.__typename)) return true;
        const r = obj.data && obj.data.tweetResult && obj.data.tweetResult.result;
        if (r && r.__typename && /Tombstone/i.test(r.__typename)) return true;
        return false;
    }

    async function lookupSyndication(tweetId) {
        const token = syndicationToken(tweetId);
        const url = 'https://cdn.syndication.twimg.com/tweet-result?id=' + encodeURIComponent(tweetId) +
            '&lang=en&token=' + encodeURIComponent(token);
        console.log('[XVid] Fallback syndication', url);
        const res = await gmRequest({ url, headers: { Accept: 'application/json' } });
        console.log('[XVid] Syndication status', res.status, 'bytes', (res.responseText || '').length);
        if (res.status !== 200 || !res.responseText) return null;
        let data;
        try { data = JSON.parse(res.responseText); } catch (e) { return null; }
        if (isTombstone(data) || !data || !Object.keys(data).length) {
            console.log('[XVid] Syndication returned tombstone or empty');
            return null;
        }
        const items = [];
        collect(data, tweetId, items);
        ingestItems(items, 'syndication');
        return items;
    }

    async function guestToken() {
        const res = await gmRequest({
            method: 'POST',
            url: 'https://api.x.com/1.1/guest/activate.json',
            headers: { Authorization: 'Bearer ' + BEARER, Accept: 'application/json' }
        });
        if (res.status !== 200) {
            console.log('[XVid] Guest activate failed', res.status);
            return null;
        }
        try {
            const tok = JSON.parse(res.responseText).guest_token;
            console.log('[XVid] Got guest token');
            return tok;
        } catch (e) {
            return null;
        }
    }

    async function lookupGraphql(tweetId, headers, label) {
        const variables = JSON.stringify({
            tweetId,
            withCommunity: false,
            includePromotedContent: false,
            withVoice: false
        });
        let features = '{}';
        for (const qid of GQL_IDS) {
            const url = 'https://api.x.com/graphql/' + qid + '/TweetResultByRestId?variables=' +
                encodeURIComponent(variables) + '&features=' + encodeURIComponent(features);
            console.log('[XVid] Fallback GraphQL', label, qid);
            let res = await gmRequest({ url, headers: Object.assign({ Accept: 'application/json' }, headers) });
            console.log('[XVid] GraphQL', label, qid, 'status', res.status, 'bytes', (res.responseText || '').length);

            if (res.status === 400 && res.responseText && /features cannot be null/i.test(res.responseText)) {
                const missing = [];
                const re = /'([^']+)'/g;
                let m;
                while ((m = re.exec(res.responseText))) missing.push(m[1]);
                const feat = {};
                missing.forEach(k => { feat[k] = true; });
                features = JSON.stringify(feat);
                console.log('[XVid] Retrying GraphQL with features', missing);
                const url2 = 'https://api.x.com/graphql/' + qid + '/TweetResultByRestId?variables=' +
                    encodeURIComponent(variables) + '&features=' + encodeURIComponent(features);
                res = await gmRequest({ url: url2, headers: Object.assign({ Accept: 'application/json' }, headers) });
                console.log('[XVid] GraphQL retry status', res.status, 'bytes', (res.responseText || '').length);
            }

            if (res.status === 404) continue;
            if (res.status !== 200 || !res.responseText) continue;
            let data;
            try { data = JSON.parse(res.responseText); } catch (e) { continue; }
            if (isTombstone(data)) {
                console.log('[XVid] GraphQL', label, 'returned tombstone (likely sensitive/blurred media)');
                return null;
            }
            const items = [];
            collect(data, tweetId, items);
            if (items.length) {
                ingestItems(items, 'graphql-' + label);
                return items;
            }
        }
        return null;
    }

    async function lookupFxtwitter(tweetId) {
        const url = 'https://api.fxtwitter.com/status/' + encodeURIComponent(tweetId);
        console.log('[XVid] Fallback fxtwitter', url);
        const res = await gmRequest({ url, headers: { Accept: 'application/json' } });
        console.log('[XVid] fxtwitter status', res.status, 'bytes', (res.responseText || '').length);
        if (res.status !== 200 || !res.responseText) return null;
        let data;
        try { data = JSON.parse(res.responseText); } catch (e) { return null; }
        const items = [];
        collect(data, tweetId, items);
        ingestItems(items, 'fxtwitter');
        return items.length ? items : null;
    }

    async function resolveUrl(video) {
        const mediaId = mediaIdOf(video);
        const tweetIds = tweetIdNear(video);
        console.log('[XVid] No cached URL. mediaId:', mediaId, 'tweetId(s):', tweetIds, 'known media:', [...byMedia.keys()]);
        if (!tweetIds.length && !mediaId) return null;

        const tryIds = tweetIds.length ? tweetIds : [];
        async function runOnIds(fn, label) {
            for (const tid of tryIds) {
                try {
                    const items = await fn(tid);
                    const picked = pickFromItems(items, mediaId, tid);
                    if (picked) {
                        console.log('[XVid] Resolved via', label, 'tweet', tid, picked.url);
                        return picked;
                    }
                } catch (e) {
                    console.log('[XVid]', label, 'failed for', tid, e);
                }
            }
            return null;
        }

        let found = await runOnIds(lookupSyndication, 'syndication');
        if (found) return found;

        const ct0 = cookie('ct0');
        if (ct0) {
            const authHeaders = {
                Authorization: 'Bearer ' + BEARER,
                'x-csrf-token': ct0,
                'x-twitter-auth-type': 'OAuth2Session',
                'x-twitter-active-user': 'yes',
                'x-twitter-client-language': 'en'
            };
            found = await runOnIds(tid => lookupGraphql(tid, authHeaders, 'session'), 'graphql-session');
            if (found) return found;
        } else {
            console.log('[XVid] No ct0 cookie, skipping logged-in GraphQL');
        }

        try {
            const gt = await guestToken();
            if (gt) {
                const guestHeaders = {
                    Authorization: 'Bearer ' + BEARER,
                    'x-guest-token': gt,
                    'x-twitter-active-user': 'yes',
                    'x-twitter-client-language': 'en'
                };
                found = await runOnIds(tid => lookupGraphql(tid, guestHeaders, 'guest'), 'graphql-guest');
                if (found) return found;
            }
        } catch (e) {
            console.log('[XVid] Guest GraphQL failed', e);
        }

        found = await runOnIds(lookupFxtwitter, 'fxtwitter');
        if (found) return found;

        console.log('[XVid] All fallbacks failed. mediaId:', mediaId, 'tweetId(s):', tweetIds);
        return null;
    }

    // ---- 4. Download (blob, same pattern as FetLife v1.4) ----
    function flash(btn, text) {
        btn.textContent = text;
        setTimeout(() => { btn.textContent = '⬇'; }, 1800);
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

    function userFor(video, tweetId) {
        const re = /^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)/;
        let node = video;
        for (let i = 0; i < 25 && node; i++, node = node.parentElement) {
            const links = node.querySelectorAll ? node.querySelectorAll('a[href*="/status/"]') : [];
            for (const a of links) {
                const m = (a.getAttribute('href') || '').match(re);
                if (m && (!tweetId || m[2] === String(tweetId))) return m[1];
            }
        }
        const m = location.pathname.match(re);
        if (m) return m[1];
        return 'unknown';
    }

    function fileName(info, video) {
        const id = info.tweetId || info.mediaId || Date.now();
        const user = info.user || (video ? userFor(video, info.tweetId) : 'unknown');
        return 'x_' + user + '_' + id + '.mp4';
    }

    function download(btn, info, video) {
        const name = fileName(info, video);
        btn.textContent = '…';
        console.log('[XVid] Fetching', info.url, 'as', name);
        return gmRequest({
            method: 'GET',
            url: info.url,
            responseType: 'blob',
            timeout: 120000
        }).then(res => {
            if (res.status !== 200 || !res.response) {
                console.log('[XVid] Bad response', res.status);
                flash(btn, '✗');
                return;
            }
            saveBlob(res.response, name);
            console.log('[XVid] Saved', name);
            flash(btn, '✓');
        }).catch(err => {
            console.log('[XVid] Request failed', err);
            flash(btn, '✗');
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
                if (btn.dataset.busy) return;
                btn.dataset.busy = '1';
                btn.textContent = '…';
                const go = async () => {
                    try {
                        let info = urlFor(video);
                        if (!info) info = await resolveUrl(video);
                        if (!info) { flash(btn, '?'); return; }
                        await download(btn, info, video);
                    } catch (err) {
                        console.log('[XVid] Click handler error', err);
                        flash(btn, '✗');
                    } finally {
                        delete btn.dataset.busy;
                    }
                };
                go();
            }, true);
            host.appendChild(btn);
        });
    }

    function start() {
        new MutationObserver(addButtons).observe(document.body, { childList: true, subtree: true });
        addButtons();
        console.log('[XVid] Loaded v' + VERSION);
    }
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start);
})();
