// ==UserScript==
// @name         Grok Imagine Auto-Confirm Delete (v7 - Click + Lock + Delete Key + Toast Top-Left)
// @namespace    http://tampermonkey.net/
// @version      1.7
// @description  Auto-clicks the Delete confirmation once, with strong lock to prevent double deletes. Press Delete key to initiate delete on the current image. Moves notifications to the top left.
// @author       Community
// @match        https://grok.com/imagine*
// @match        https://www.grok.com/imagine*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/Smile953/userscripts/main/grok-imagine-auto-confirm-delete.user.js
// @downloadURL  https://raw.githubusercontent.com/Smile953/userscripts/main/grok-imagine-auto-confirm-delete.user.js
// ==/UserScript==

(function() {
    'use strict';

    let lastFired = 0;
    let isProcessing = false;

    // ---------- Move notifications to top-left ----------
    const TOAST_OFFSET = '24px';
    const style = document.createElement('style');
    style.textContent = `
        [data-sonner-toaster],
        [data-sonner-toaster][data-y-position],
        [data-sonner-toaster][data-x-position] {
            top: ${TOAST_OFFSET} !important;
            bottom: auto !important;
            left: ${TOAST_OFFSET} !important;
            right: auto !important;
            transform: none !important;
        }
    `;
    document.head.appendChild(style);

    function moveToastsTopLeft() {
        const all = document.querySelectorAll('body *');
        for (const el of all) {
            if (el.dataset.tmMoved) continue;
            if (el.children.length > 0) continue; // leaf text elements only
            if (!(el.textContent || '').includes('Content Moderated')) continue;
            el.dataset.tmMoved = '1';
            const chain = [];
            let node = el;
            while (node && node !== document.body) {
                const cs = getComputedStyle(node);
                chain.push(`${node.tagName}.${node.className} [${cs.position}]`);
                if (cs.position === 'fixed' || cs.position === 'absolute') {
                    node.style.setProperty('top', TOAST_OFFSET, 'important');
                    node.style.setProperty('bottom', 'auto', 'important');
                    node.style.setProperty('left', TOAST_OFFSET, 'important');
                    node.style.setProperty('right', 'auto', 'important');
                    node.style.setProperty('margin-left', '0', 'important');
                    node.style.setProperty('margin-top', '0', 'important');
                    node.style.setProperty('translate', 'none', 'important');
                    node.style.setProperty('transform', 'none', 'important');
                }
                if (cs.display.includes('flex')) {
                    node.style.setProperty('align-items', 'flex-start', 'important');
                    node.style.setProperty('justify-content', 'flex-start', 'important');
                }
                if (cs.marginLeft === 'auto') node.style.setProperty('margin-left', '0', 'important');
                if (cs.marginTop === 'auto') node.style.setProperty('margin-top', '0', 'important');
                if (cs.position === 'fixed') break;
                node = node.parentElement;
            }
            console.log('[ToastTopLeft] chain:', chain);
        }
    }

    // ----------------------------------------------------
    function autoConfirm() {
        const now = Date.now();
        if (isProcessing || now - lastFired < 700) return;
        const bodyText = document.body.innerText || '';
        if (!bodyText.includes('Are you sure you want to delete?') && !bodyText.includes('This cannot be undone.')) {
            return;
        }
        const buttons = Array.from(document.querySelectorAll('button'));
        const deleteBtn = buttons.find(btn => {
            const txt = (btn.textContent || '').trim().toLowerCase();
            return txt === 'delete video' || txt === 'delete image' || txt === 'delete' || txt.startsWith('delete ');
        });
        if (deleteBtn && deleteBtn.offsetParent !== null) {
            isProcessing = true;
            lastFired = now;
            console.log('[AutoConfirm] Clicking once:', deleteBtn.textContent.trim());
            deleteBtn.click();
            setTimeout(() => { isProcessing = false; }, 700);
        }
    }

    function triggerDelete() {
        const bodyText = document.body.innerText || '';
        if (bodyText.includes('Are you sure you want to delete?') || bodyText.includes('This cannot be undone.')) {
            return;
        }
        const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
        const deleteBtn = buttons.find(btn => {
            if (btn.offsetParent === null) return false;
            const txt = (btn.textContent || '').trim().toLowerCase();
            const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
            const title = (btn.getAttribute('title') || '').toLowerCase();
            return txt === 'delete' || txt === 'delete image' || txt === 'delete video' || txt.startsWith('delete ') || aria.includes('delete') || title.includes('delete');
        });
        if (deleteBtn) {
            console.log('[AutoConfirm] Delete key → clicking:', deleteBtn.textContent.trim() || deleteBtn.getAttribute('aria-label') || 'icon button');
            deleteBtn.click();
        } else {
            console.log('[AutoConfirm] Delete key pressed but no delete button found');
        }
    }

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Delete') return;
        const active = document.activeElement;
        if (active && (
            active.tagName === 'INPUT' ||
            active.tagName === 'TEXTAREA' ||
            active.tagName === 'SELECT' ||
            active.isContentEditable
        )) return;
        if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
        e.preventDefault();
        e.stopPropagation();
        triggerDelete();
    }, true);

    const observer = new MutationObserver(() => {
        setTimeout(autoConfirm, 40);
        moveToastsTopLeft();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setInterval(autoConfirm, 350);
    console.log('Grok Imagine Auto-Confirm Delete v7 (Click + Lock + Delete Key + Toast Top-Left) loaded – only on /imagine');
})();
