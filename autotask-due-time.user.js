// ==UserScript==
// @name         Autotask Ticket Due Time 17:30
// @namespace    violentmonkey
// @version      1.5
// @description  Sets only the ticket Due Time to 17:30 (never touches the date)
// @match        *://*.autotask.net/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/Smile953/userscripts/main/autotask-due-time.user.js
// @downloadURL  https://raw.githubusercontent.com/Smile953/userscripts/main/autotask-due-time.user.js
// ==/UserScript==

(function () {
  'use strict';

  const TARGET_TIME = '17:30';
  const TIME_RE = /^\s*\d{1,2}:\d{2}(\s*[ap]m)?\s*$/i;
  const DATE_RE = /\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/;

  function looksLikeDateInput(input) {
    const v = (input.value || '').trim();
    const attrs = [input.name, input.id, input.className, input.placeholder, input.getAttribute('aria-label')].join(' ').toLowerCase();
    return DATE_RE.test(v) || attrs.includes('date') || input.closest('.DateBox, .DatePicker, [class*="Date"]');
  }

  function setTime(input) {
    if (!input || input.disabled || input.readOnly) return;
    if (looksLikeDateInput(input)) return;
    const v = (input.value || '').trim();
    if (v === TARGET_TIME) return;
    if (v && !TIME_RE.test(v)) return; // only overwrite empty or time values
    input.value = TARGET_TIME;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    if (typeof window.formatTime === 'function') {
      try { window.formatTime(); } catch (e) {}
    }
    console.log('[DueTime] set to', TARGET_TIME, input);
  }

  function isDueTimeBox(box) {
    const block = box.closest('tr, .Field, .FormItem, .DetailItem, li') || box.parentElement;
    if (!block) return false;
    const text = (block.textContent || '').replace(/\s+/g, ' ').toLowerCase();
    return text.includes('due time');
  }

  function run() {
    const classic = document.querySelector('#dueTime, input[name="dueTime"]');
    if (classic) setTime(classic);

    document.querySelectorAll('div.TimeBox2 input[type="text"]').forEach(input => {
      const box = input.closest('.TimeBox2');
      if (box && isDueTimeBox(box)) setTime(input);
    });
  }

  const obs = new MutationObserver(() => run());
  obs.observe(document.documentElement, { childList: true, subtree: true });
  setInterval(run, 1200);
  run();
})();
