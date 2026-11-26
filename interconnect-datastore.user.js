// ==UserScript==
// @name         0. InterConnect Datastore GB + Free %
// @namespace    violentmonkey
// @version      1.5
// @match        https://vcenter01.hosting.interconnect.nl/folder*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/Smile953/userscripts/main/interconnect-datastore.user.js
// @downloadURL  https://raw.githubusercontent.com/Smile953/userscripts/main/interconnect-datastore.user.js
// ==/UserScript==

(function () {
  'use strict';

  const RED_BELOW_PCT = 5;

  if (!/dcPath=InterConnect/.test(location.search)) return;

  const toGB = n => Math.floor(n / 1024 ** 3);

  function run() {
    document.querySelectorAll('table').forEach(table => {
      const header = table.querySelector('tr');
      if (!header || header.dataset.vmDone) return;
      const ths = header.querySelectorAll('th');
      if (ths.length < 3 || !/capacity/i.test(ths[1].textContent)) return;
      header.dataset.vmDone = '1';

      ths[1].textContent = 'Capacity (GB)';
      ths[2].textContent = 'Free (GB)';
      const th = document.createElement('th');
      th.textContent = 'Free %';
      header.appendChild(th);

      table.querySelectorAll('tr').forEach((row, i) => {
        if (i === 0) return;
        const tds = row.querySelectorAll('td');
        if (tds.length < 3) return;

        const cap = parseFloat(tds[1].innerText.replace(/\D/g, ''));
        const free = parseFloat(tds[2].innerText.replace(/\D/g, ''));
        if (!cap) return;

        const pct = (free / cap) * 100;
        tds[1].textContent = toGB(cap);
        tds[2].textContent = toGB(free);

        const td = document.createElement('td');
        td.align = 'right';
        td.textContent = pct.toFixed(2) + '%';
        if (pct < RED_BELOW_PCT) {
          td.style.color = 'red';
          td.style.fontWeight = 'bold';
        }
        row.appendChild(td);
      });
    });
  }

  run();
  new MutationObserver(run).observe(document.body, { childList: true, subtree: true });
})();
