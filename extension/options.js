// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
//
// options.js — full settings: journal connection, register/test, and the
// opt-in allowlist manager (add by host, remove honored both ways).

const $ = (id) => document.getElementById(id);
const cmd = (m) => new Promise((r) => chrome.runtime.sendMessage(m, (x) => r(x || {})));

let state = null;

function normHost(input) {
  let h = input.trim();
  try {
    if (/^https?:\/\//.test(h)) h = new URL(h).host;
  } catch (_e) {
    /* leave as typed */
  }
  return h.replace(/\/.*$/, "").toLowerCase();
}

async function refresh() {
  state = await cmd({ cmd: "getState" });
  $("hostname").value = state.hostname || "";
  $("journalUrl").value = state.journalUrl || "";
  $("segmentSec").value = state.segmentSec || 300;
  $("ver").textContent = state.version ? "v" + state.version : "";
  $("streamLabel").textContent = state.stream || (state.hostname ? state.hostname + ".browser" : "—");

  const cs = $("connStatus");
  if (state.registered && !(state.health && state.health.lastError)) {
    const up = state.health && state.health.lastUploadAt ? new Date(state.health.lastUploadAt).toLocaleTimeString() : "none yet";
    cs.innerHTML = `<span class="pill ok">registered as ${state.stream}</span> · ${state.health.segmentsUploaded || 0} segments sent · last ${up}`;
  } else if (state.health && state.health.lastError) {
    cs.innerHTML = `<span class="pill bad">not connected</span> · ${state.health.lastError}`;
  } else {
    cs.innerHTML = `<span class="pill">not registered</span> · saved settings, click “register / test connection”`;
  }

  const list = $("siteList");
  const errs = state.siteErrors || {};
  if (state.allowlist.length) {
    list.innerHTML = state.allowlist
      .map((h) => {
        let status;
        if (errs[h]) status = `<span style="color:var(--bad)">⚠ ${errs[h]}</span>`;
        else if (state.activeSites.includes(h)) status = '<span style="color:var(--ok)">● observing now</span>';
        else status = '<span class="muted">added — open or reload a tab on this site</span>';
        return `<div class="site"><span>${h} &nbsp; ${status}</span><button data-host="${h}">remove</button></div>`;
      })
      .join("");
    list.querySelectorAll("button[data-host]").forEach((b) =>
      b.addEventListener("click", async () => {
        await cmd({ cmd: "removeSite", host: b.getAttribute("data-host") });
        await refresh();
      })
    );
  } else {
    list.innerHTML = '<p class="muted">none yet.</p>';
  }
}

$("saveBtn").addEventListener("click", async () => {
  await cmd({
    cmd: "setConfig",
    hostname: $("hostname").value,
    journalUrl: $("journalUrl").value,
    segmentSec: Number($("segmentSec").value) || 300,
  });
  $("connStatus").textContent = "saved.";
  await refresh();
});

$("registerBtn").addEventListener("click", async () => {
  $("connStatus").textContent = "registering…";
  const r = await cmd({ cmd: "registerNow" });
  if (r.ok) $("connStatus").innerHTML = `<span class="pill ok">registered as ${r.stream}</span>`;
  else $("connStatus").innerHTML = `<span class="pill bad">failed</span> · ${r.error || "unknown"}`;
  await refresh();
});

$("flushBtn").addEventListener("click", async () => {
  await cmd({ cmd: "flushNow" });
  $("connStatus").textContent = "flushed buffered content to the journal.";
  await refresh();
});

$("addBtn").addEventListener("click", async () => {
  const host = normHost($("newHost").value);
  if (!host) {
    $("addStatus").textContent = "enter a host like mail.google.com (or localhost, an IP, host:port)";
    return;
  }
  // request a port-less origin (match patterns reject ports); the worker keeps
  // port precision via the allowlist self-gate.
  const origin = `*://${globalThis.SolstoneHosts.matchHostFor(host)}/*`;
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) {
    $("addStatus").textContent = "permission declined — nothing added.";
    return;
  }
  const res = await cmd({ cmd: "siteGranted", host });
  $("newHost").value = "";
  $("addStatus").textContent = res && res.error ? "could not observe: " + res.error : `added ${host}. open or reload a tab on it to begin.`;
  await refresh();
});

refresh();
