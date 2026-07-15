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
  // Store the full host (with port) for allowlist precision.
  return { host: u.host, ok: u.protocol === "http:" || u.protocol === "https:" };
}

let state = null;
let pageHost = null;

async function requestSiteAccess(host) {
  const intent = await cmd({ cmd: "siteIntent", host });
  if (!intent.ok) return { ok: false, error: "could not save the site" };
  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins: [globalThis.SolstoneHosts.matchPatternFor(host)] });
  } catch (_e) {
    /* handled as a declined grant */
  }
  if (!granted) {
    if (intent.added) await cmd({ cmd: "removeSite", host });
    return { ok: false, denied: true, added: intent.added };
  }
  return cmd({ cmd: "siteGranted", host });
}

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
      const pausedByBrowser = (state.pausedHosts || {})[globalThis.SolstoneHosts.matchHostFor(host)];
      $("pageState").textContent = observed ? `${host} · ${pausedByBrowser ? "paused by browser" : "on"}` : ok ? host : "can't be added";
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
          const row = globalThis.SolstoneStatus.siteRowState(h2, {
            matchHost: globalThis.SolstoneHosts.matchHostFor(h2),
            pausedHosts: state.pausedHosts || {},
            siteErrors: errs,
            paused: state.paused,
            activeSites: state.activeSites,
            connected,
            pageHost,
          });
          if (row.kind === "error") {
            const err = esc(row.label);
            const classified = esc(globalThis.SolstoneFailures.classify(row.label));
            return `<div class="s" style="color:var(--bad)" title="${err}">· ${host} — ${classified}</div>`;
          }
          if (row.kind === "paused-browser") return `<div class="s">· ${host} <span class="muted">— ${esc(row.label)}</span><button type="button" class="allow-site" data-host="${host}">allow again</button></div>`;
          if (row.kind === "paused") return `<div class="s">· ${host} <span class="muted">— ${esc(row.label)}</span></div>`;
          if (row.kind === "on") return `<div class="s">· ${host} <span style="color:var(--ok)">● ${esc(row.label)}</span></div>`;
          if (row.kind === "waiting") return `<div class="s">· ${host} ${esc(row.label)}</div>`;
          if (row.kind === "reload") return `<div class="s">· ${host} <button type="button" class="reload-site">${esc(row.label)}</button></div>`;
          return `<div class="s">· ${host} <span class="muted">— ${esc(row.label)}</span></div>`;
        })
        .join("");
    sites.querySelectorAll(".reload-site").forEach((reload) => {
      reload.addEventListener("click", async () => {
        const current = tab && tab.id != null ? tab : await currentTab();
        if (current && current.id != null) chrome.tabs.reload(current.id);
      });
    });
    sites.querySelectorAll(".allow-site[data-host]").forEach((button) => {
      button.addEventListener("click", async () => {
        button.disabled = true;
        const res = await requestSiteAccess(button.getAttribute("data-host"));
        if (res.denied) $("err").textContent = "permission declined — site stays paused.";
        else if (res.error) $("err").textContent = res.error;
        await refresh();
      });
    });
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
  const { host, ok } = originFor(tab.url);
  if (!ok) return;
  const res = await requestSiteAccess(host);
  if (res.denied) {
    $("err").textContent = "permission declined — nothing added.";
    return;
  }
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
