// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
//
// indicator.js — the on-page "observing" trust marker: the official sol ring
// mark + a label, in a closed shadow root (so page CSS can't restyle or hide
// it), reflecting the paused state. The owner-visible indicator the iOS source
// framework defines, on every observed tab.
//
// Classic content script -> publishes `globalThis.SolstoneIndicator`.

(function () {
  "use strict";

  const HOST_ID = "solstone-observer-indicator-host";
  // the official sol ring mark (gold rays + orange ring), inline so no resource fetch
  const RAYS =
    "M16.0 2.5 L18.6 7.3 A9.1 9.1 0 0 0 13.4 7.3 Z M23.9 5.1 L23.2 10.5 A9.1 9.1 0 0 0 19.0 7.4 Z M28.8 11.8 L25.1 15.8 A9.1 9.1 0 0 0 23.5 10.9 Z M28.8 20.2 L23.5 21.1 A9.1 9.1 0 0 0 25.1 16.2 Z M23.9 26.9 L19.0 24.6 A9.1 9.1 0 0 0 23.2 21.5 Z M16.0 29.5 L13.4 24.7 A9.1 9.1 0 0 0 18.6 24.7 Z M8.1 26.9 L8.8 21.5 A9.1 9.1 0 0 0 13.0 24.6 Z M3.2 20.2 L6.9 16.2 A9.1 9.1 0 0 0 8.5 21.1 Z M3.2 11.8 L8.5 10.9 A9.1 9.1 0 0 0 6.9 15.8 Z M8.1 5.1 L13.0 7.4 A9.1 9.1 0 0 0 8.8 10.5 Z";
  const SOL_RING =
    `<svg width="15" height="15" viewBox="2.5 2.5 27 27" aria-hidden="true">` +
    `<path fill="#FFCF33" d="${RAYS}"/>` +
    `<circle cx="16" cy="16" r="6.5" fill="none" stroke="#E8923A" stroke-width="1.7"/></svg>`;

  let hostEl = null;
  let labelEl = null;

  function ensure() {
    if (hostEl && document.documentElement.contains(hostEl)) return;
    hostEl = document.createElement("div");
    hostEl.id = HOST_ID;
    hostEl.style.cssText = "all:initial;position:fixed;bottom:14px;right:14px;z-index:2147483647;";
    const shadow = hostEl.attachShadow ? hostEl.attachShadow({ mode: "closed" }) : null;
    const root = shadow || hostEl;
    const pill = document.createElement("div");
    pill.style.cssText = [
      "font:600 12px/1 -apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif",
      "display:flex;align-items:center;gap:7px",
      "padding:6px 11px 6px 8px;border-radius:999px",
      "background:rgba(26,26,26,0.92);color:#FAF3E4",
      "box-shadow:0 2px 10px rgba(0,0,0,0.35);user-select:none;cursor:default",
    ].join(";");
    const mark = document.createElement("span");
    mark.style.cssText = "display:flex;align-items:center";
    mark.innerHTML = SOL_RING;
    labelEl = document.createElement("span");
    labelEl.textContent = "observing";
    pill.appendChild(mark);
    pill.appendChild(labelEl);
    pill.title = "solstone is experiencing this page with you";
    root.appendChild(pill);
    (document.body || document.documentElement).appendChild(hostEl);
  }

  function show(paused) {
    ensure();
    if (labelEl) labelEl.textContent = paused ? "paused" : "observing";
    if (hostEl) hostEl.style.opacity = paused ? "0.5" : "1";
  }

  function remove() {
    if (hostEl && hostEl.parentNode) hostEl.parentNode.removeChild(hostEl);
    hostEl = null;
    labelEl = null;
  }

  globalThis.SolstoneIndicator = { show, remove };
})();
