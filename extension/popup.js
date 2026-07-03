// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
//
// popup.js — the toolbar popup: status at a glance, "observe this site"
// (the per-site grant moment), and pause-all.

const $ = (id) => document.getElementById(id);
const esc = (s) => globalThis.SolstoneEscape.escapeHtml(s);

function cmd(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, (r) => resolve(r || {})));
}

async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function originFor(url) {
  const u = new URL(url);
  // store the full host (with port) for precision; request a port-less origin
  // (Chrome match patterns / permission origins reject ports).
  const matchHost = globalThis.SolstoneHosts.matchHostFor(u.host);
  return { host: u.host, origin: `*://${matchHost}/*`, ok: u.protocol === "http:" || u.protocol === "https:" };
}

let state = null;
let pageHost = null;

async function refresh() {
  state = await cmd({ cmd: "getState" });
  const tab = await currentTab();
  const h = state.health || {};

  // journal
  const j = $("journalState");
  if (state.registered && !h.lastError) {
    j.textContent = "connected";
    j.className = "pill ok";
  } else if (h.lastError) {
    j.textContent = "can't reach";
    j.className = "pill bad";
  } else {
    j.textContent = "not connected yet";
    j.className = "pill";
  }
  $("consequenceText").textContent = h.lastError ? "your journal isn't answering. what sol takes in is kept here, waiting to sync." : "";
  $("consequence").title = h.lastError || "";
  $("consequence").hidden = !h.lastError;
  const dropped = state.dropped || {};
  const outbox = state.outbox || {};
  $("lossText").textContent = dropped.lines > 0 ? `offline too long — the oldest ${dropped.lines} updates couldn't be kept.` : "";
  $("loss").hidden = !(dropped.segments > 0);
  $("lossBtn").hidden = !!outbox.lines;

  // pause
  const p = $("pauseState");
  p.textContent = state.paused ? "paused" : "on";
  p.className = "pill" + (state.paused ? "" : " ok");
  $("pauseBtn").textContent = state.paused ? "resume all" : "pause all";

  // this page
  let canAdd = false;
  pageHost = null;
  const addBtn = $("addBtn");
  addBtn.textContent = "add this site";
  addBtn.className = "primary";
  addBtn.disabled = true;
  addBtn.dataset.mode = "add";
  if (tab && tab.url) {
    try {
      const { host, ok } = originFor(tab.url);
      pageHost = host;
      const observed = state.allowlist.includes(host);
      $("pageState").textContent = observed ? `${host} · on` : ok ? host : "can't be added";
      canAdd = ok;
      if (observed) {
        addBtn.textContent = "remove this site";
        addBtn.className = "";
        addBtn.disabled = false;
        addBtn.dataset.mode = "stop";
      } else {
        addBtn.textContent = "add this site";
        addBtn.className = "primary";
        addBtn.disabled = !canAdd;
        addBtn.dataset.mode = "add";
      }
    } catch (_e) {
      $("pageState").textContent = "—";
    }
  } else {
    $("pageState").textContent = "—";
  }

  // observed sites — show per-site state: observing / added (reload) / error
  const sites = $("sites");
  const errs = state.siteErrors || {};
  const connected = state.registered && !h.lastError;
  if (state.allowlist.length) {
    sites.innerHTML =
      '<div class="row" style="border-top:1px solid var(--line)"><span class="muted">added sites</span>' +
      `<span class="s">${state.activeSites.length} on · ${state.waiting || 0} updates waiting</span></div>` +
      state.allowlist
        .map((h2) => {
          const host = esc(h2);
          if (errs[h2]) {
            const err = esc(errs[h2]);
            const classified = esc(globalThis.SolstoneFailures.classify(errs[h2]));
            return `<div class="s" style="color:var(--bad)" title="${err}">· ${host} — ${classified}</div>`;
          }
          if (state.paused) return `<div class="s">· ${host} <span class="muted">— paused</span></div>`;
          if (state.activeSites.includes(h2) && connected) return `<div class="s">· ${host} <span style="color:var(--ok)">● on</span></div>`;
          if (state.activeSites.includes(h2)) return `<div class="s">· ${host} on — waiting to sync</div>`;
          if (h2 === pageHost) return `<div class="s">· ${host} <button type="button" class="reload-site">reload this tab to begin</button></div>`;
          return `<div class="s">· ${host} <span class="muted">— open/reload a tab</span></div>`;
        })
        .join("");
    const reload = sites.querySelector(".reload-site");
    if (reload) {
      reload.addEventListener("click", async () => {
        const current = tab && tab.id != null ? tab : await currentTab();
        if (current && current.id != null) chrome.tabs.reload(current.id);
      });
    }
  } else {
    sites.innerHTML = '<div class="s muted" style="padding-top:6px">no sites yet — open any site and click “add this site”.</div>';
  }

  const streamText = state.stream || (state.hostname ? `${state.hostname}.browser` : "—");
  const streamLabel = $("streamLabel");
  streamLabel.textContent = "";
  if (state.journalUrl) {
    const a = document.createElement("a");
    a.href = state.journalUrl;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = `${streamText} ↗`;
    streamLabel.appendChild(a);
  } else {
    streamLabel.textContent = streamText;
  }
  const us = await chrome.action.getUserSettings().catch(() => ({}));
  $("pinHint").hidden = us.isOnToolbar !== false;
}

$("addBtn").addEventListener("click", async () => {
  if ($("addBtn").dataset.mode === "stop") {
    if (pageHost) await cmd({ cmd: "removeSite", host: pageHost });
    await refresh();
    return;
  }
  const tab = await currentTab();
  if (!tab || !tab.url) return;
  const { host, origin, ok } = originFor(tab.url);
  if (!ok) return;
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) {
    $("err").textContent = "permission declined — nothing added.";
    return;
  }
  const res = await cmd({ cmd: "siteGranted", host });
  if (res && res.error) $("err").textContent = res.error;
  await refresh();
});

$("tryBtn").addEventListener("click", async () => {
  const b = $("tryBtn");
  b.disabled = true;
  b.textContent = "checking…";
  await cmd({ cmd: "probe" });
  b.disabled = false;
  b.textContent = "try now";
  await refresh();
});

$("lossBtn").addEventListener("click", async () => {
  await cmd({ cmd: "clearDropped" });
  await refresh();
});

$("pauseBtn").addEventListener("click", async () => {
  await cmd({ cmd: "setPaused", paused: !state.paused });
  await refresh();
});

$("optsLink").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

refresh();
