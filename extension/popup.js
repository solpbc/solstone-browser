// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
//
// popup.js — the toolbar popup: status at a glance, "observe this site"
// (the per-site grant moment), and pause-all.

const $ = (id) => document.getElementById(id);

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

  // journal
  const reachable = state.registered && !(state.health && state.health.lastError);
  const j = $("journalState");
  if (state.registered && reachable) {
    j.textContent = "connected";
    j.className = "pill ok";
  } else if (state.health && state.health.lastError) {
    j.textContent = "unreachable";
    j.className = "pill bad";
  } else {
    j.textContent = "not yet registered";
    j.className = "pill";
  }

  // pause
  const p = $("pauseState");
  p.textContent = state.paused ? "paused" : "active";
  p.className = "pill " + (state.paused ? "bad" : "ok");
  $("pauseBtn").textContent = state.paused ? "resume all" : "pause all";

  // this page
  let canAdd = false;
  pageHost = null;
  if (tab && tab.url) {
    try {
      const { host, ok } = originFor(tab.url);
      pageHost = host;
      const observed = state.allowlist.includes(host);
      $("pageState").textContent = observed ? `observing ${host}` : ok ? host : "not observable";
      canAdd = ok && !observed;
      $("addBtn").textContent = observed ? "observing ✓" : "observe this site";
    } catch (_e) {
      $("pageState").textContent = "—";
    }
  } else {
    $("pageState").textContent = "—";
  }
  $("addBtn").disabled = !canAdd;

  // observed sites — show per-site state: observing / added (reload) / error
  const sites = $("sites");
  const errs = state.siteErrors || {};
  if (state.allowlist.length) {
    sites.innerHTML =
      '<div class="row" style="border-top:1px solid var(--line)"><span class="muted">observed sites</span>' +
      `<span class="s">${state.activeSites.length} active · ${state.pendingLines} buffered</span></div>` +
      state.allowlist
        .map((h) => {
          if (errs[h]) return `<div class="s" style="color:var(--bad)">· ${h} — ${errs[h]}</div>`;
          if (state.activeSites.includes(h)) return `<div class="s">· ${h} <span style="color:var(--ok)">● observing</span></div>`;
          return `<div class="s">· ${h} <span class="muted">— open/reload a tab</span></div>`;
        })
        .join("");
  } else {
    sites.innerHTML = '<div class="s muted" style="padding-top:6px">no sites yet — open any site and click “observe this site”.</div>';
  }

  $("streamLabel").textContent = state.stream || (state.hostname ? `${state.hostname}.browser` : "—");
  const errMsgs = Object.values(errs);
  $("err").textContent = (state.health && state.health.lastError) || errMsgs[0] || "";
  const us = await chrome.action.getUserSettings().catch(() => ({}));
  $("pinHint").hidden = us.isOnToolbar !== false;
}

$("addBtn").addEventListener("click", async () => {
  const tab = await currentTab();
  if (!tab || !tab.url) return;
  const { host, origin, ok } = originFor(tab.url);
  if (!ok) return;
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) {
    $("err").textContent = "permission declined — nothing is observed.";
    return;
  }
  const res = await cmd({ cmd: "siteGranted", host });
  if (res && res.error) $("err").textContent = res.error;
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
