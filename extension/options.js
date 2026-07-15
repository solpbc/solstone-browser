// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
//
// options.js — full settings: journal connection, connect, and the
// opt-in allowlist manager (add by host, remove honored both ways).

const $ = (id) => document.getElementById(id);
const cmd = (m) => new Promise((r) => chrome.runtime.sendMessage(m, (x) => r(x || {})));
const esc = (s) => globalThis.SolstoneEscape.escapeHtml(s);

let state = null;
let loadedHostname = "";
let loadedJournalUrl = "";

function normHost(input) {
  let h = input.trim();
  try {
    if (/^https?:\/\//.test(h)) h = new URL(h).host;
  } catch (_e) {
    /* leave as typed */
  }
  return h.replace(/\/.*$/, "").toLowerCase();
}

function renderConnStatus() {
  const h = state.health || {};
  const cs = $("connStatus");
  if (state.registered && !h.lastError) {
    const up = h.lastUploadAt ? new Date(h.lastUploadAt).toLocaleTimeString() : "none yet";
    cs.innerHTML = `<span class="pill ok">connected as ${esc(state.stream)}</span> · ${h.segmentsUploaded || 0} sent · last ${esc(up)}`;
  } else if (h.lastError) {
    cs.innerHTML = `<span class="pill bad">can't reach</span> · <span title="${esc(h.lastError)}">your journal isn't answering. what sol takes in is kept here, waiting to sync.</span>`;
  } else {
    cs.innerHTML = '<span class="pill">not connected yet</span> · add your journal address and save';
  }
}

function renderJournalLink() {
  const a = $("journalLink");
  if (state.journalUrl) {
    a.href = state.journalUrl;
    a.className = "";
    a.removeAttribute("aria-disabled");
  } else {
    a.removeAttribute("href");
    a.className = "disabled-link";
    a.setAttribute("aria-disabled", "true");
  }
}

function permissionOriginForRelay(relayOrigin) {
  const u = new URL(relayOrigin);
  return `${u.origin}/*`;
}

async function requestSiteAccess(host) {
  const intent = await cmd({ cmd: "siteIntent", host });
  if (!intent.ok) return intent;
  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins: [globalThis.SolstoneHosts.matchPatternFor(host)] });
  } catch (_e) {
    /* handled as a declined grant */
  }
  if (!granted) {
    if (intent.added) await cmd({ cmd: "removeSite", host });
    return { ok: false, denied: true, added: intent.added, intentOk: true };
  }
  const res = await cmd({ cmd: "siteGranted", host });
  return Object.assign({}, res, { added: intent.added, intentOk: true });
}

function renderRemoteState() {
  const remote = state.remote || {};
  $("unpairBtn").hidden = !remote.paired;
  if (remote.paired) {
    $("remoteState").textContent = `paired to ${remote.instanceId || "remote home"} via ${remote.relayOrigin || "relay"}.`;
  } else {
    $("remoteState").textContent = "not paired.";
  }
}

async function renderWaiting() {
  const preview = await cmd({ cmd: "getBufferedPreview" });
  const total = preview.waiting || 0;
  const outbox = preview.outbox || {};
  const dropped = preview.dropped || {};
  $("waitingSummary").textContent = `waiting to send (${total} updates)`;
  const body = $("waitingBody");
  body.textContent = "";
  if (dropped.segments > 0) {
    const loss = document.createElement("div");
    loss.className = "loss";
    const text = document.createElement("span");
    text.textContent = `offline too long — the oldest ${dropped.lines} updates couldn't be kept.`;
    loss.appendChild(text);
    if (!outbox.lines) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "dismiss";
      btn.addEventListener("click", async () => {
        await cmd({ cmd: "clearDropped" });
        await refresh();
      });
      loss.appendChild(btn);
    }
    body.appendChild(loss);
  }
  if (outbox.lines > 0) {
    const earlier = document.createElement("div");
    earlier.className = "muted";
    earlier.textContent = `${outbox.lines} updates from earlier are waiting to sync.`;
    body.appendChild(earlier);
  }
  if ((!total && !(dropped.segments > 0)) || (!(preview.perHost || []).length && !outbox.lines && !(dropped.segments > 0))) {
    body.textContent = "nothing waiting.";
    return;
  }
  for (const entry of preview.perHost || []) {
    const wrap = document.createElement("div");
    wrap.className = "waiting-host";
    const head = document.createElement("strong");
    head.textContent = `${entry.host} · ${entry.count} update${entry.count === 1 ? "" : "s"}`;
    wrap.appendChild(head);
    if ((entry.texts || []).length) {
      const ul = document.createElement("ul");
      for (const text of entry.texts) {
        const li = document.createElement("li");
        li.textContent = text;
        ul.appendChild(li);
      }
      wrap.appendChild(ul);
    }
    body.appendChild(wrap);
  }
}

async function refresh() {
  state = await cmd({ cmd: "getState" });
  $("hostname").value = state.hostname || "";
  $("journalUrl").value = state.journalUrl || "";
  $("segmentSec").value = state.segmentSec || 300;
  $("showPageIndicator").checked = !!state.showPageIndicator;
  $("ver").textContent = state.version ? "v" + state.version : "";
  $("streamLabel").textContent = state.stream || (state.hostname ? state.hostname + ".browser" : "—");
  loadedHostname = state.hostname || "";
  loadedJournalUrl = state.journalUrl || "";

  renderConnStatus();
  renderJournalLink();
  renderRemoteState();
  await renderWaiting();

  const list = $("siteList");
  const errs = state.siteErrors || {};
  if (state.allowlist.length) {
    list.innerHTML = state.allowlist
      .map((h) => {
        const host = esc(h);
        const row = globalThis.SolstoneStatus.siteRowState(h, {
          matchHost: globalThis.SolstoneHosts.matchHostFor(h),
          pausedHosts: state.pausedHosts || {},
          siteErrors: errs,
          paused: state.paused,
          activeSites: state.activeSites,
          connected: state.registered && !(state.health && state.health.lastError),
          pageHost: null,
        });
        let status;
        if (row.kind === "error") status = `<span style="color:var(--bad)" title="${esc(row.label)}">⚠ ${esc(globalThis.SolstoneFailures.classify(row.label))}</span>`;
        else if (row.kind === "paused-browser" || row.kind === "paused" || row.kind === "idle") status = `<span class="muted">— ${esc(row.label)}</span>`;
        else if (row.kind === "on") status = `<span style="color:var(--ok)">● ${esc(row.label)}</span>`;
        else status = esc(row.label);
        const allowAgain = row.kind === "paused-browser" ? `<button type="button" class="allow-site" data-host="${host}">allow again</button>` : "";
        return `<div class="site"><span>${host} &nbsp; ${status}</span><span>${allowAgain}<button type="button" class="remove-site" data-host="${host}">remove</button></span></div>`;
      })
      .join("");
    list.querySelectorAll("button.remove-site[data-host]").forEach((b) =>
      b.addEventListener("click", async () => {
        await cmd({ cmd: "removeSite", host: b.getAttribute("data-host") });
        await refresh();
      })
    );
    list.querySelectorAll("button.allow-site[data-host]").forEach((b) =>
      b.addEventListener("click", async () => {
        b.disabled = true;
        const res = await requestSiteAccess(b.getAttribute("data-host"));
        $("addStatus").textContent = res.denied ? "permission declined — site stays paused." : res.error ? "could not allow: " + res.error : "allowed again.";
        await refresh();
      })
    );
  } else {
    list.innerHTML = '<p class="muted">none yet.</p>';
  }
}

async function saveConfig() {
  const segmentSec = Number.parseInt($("segmentSec").value, 10);
  if (Number.isNaN(segmentSec) || segmentSec < 30) {
    $("connStatus").textContent = "minimum 30 seconds";
    return;
  }

  const hostname = $("hostname").value;
  const journalUrl = $("journalUrl").value;
  const connectionChanged = hostname.trim() !== loadedHostname || journalUrl.trim().replace(/\/+$/, "") !== loadedJournalUrl;
  await cmd({ cmd: "setConfig", hostname, journalUrl, segmentSec });

  if (connectionChanged) {
    $("connStatus").textContent = "connecting…";
    await cmd({ cmd: "probe" });
    await refresh();
  } else {
    await refresh();
    $("connStatus").textContent = "saved.";
  }
}

async function addSite() {
  const raw = $("newHost").value;
  if (!globalThis.SolstoneHosts.isValidHostInput(raw)) {
    $("addStatus").textContent = "enter a site like mail.google.com";
    return;
  }
  const host = normHost(raw);
  const res = await requestSiteAccess(host);
  if (res.intentOk) $("newHost").value = "";
  if (res.denied) {
    $("addStatus").textContent = "permission declined — nothing added.";
    return;
  }
  $("addStatus").textContent = res && res.error ? "could not add: " + res.error : `added ${host}. open or reload a tab on it to begin.`;
  await refresh();
}

async function pairRemote() {
  const link = $("pairLink").value.trim();
  let parsed;
  try {
    parsed = globalThis.SolstonePairlink.parseLink(link);
  } catch (_e) {
    $("pairStatus").textContent = "paste a valid pair link.";
    return;
  }
  const origin = permissionOriginForRelay(parsed.relayOrigin);
  const intent = await cmd({ cmd: "relayIntent", relayOrigin: parsed.relayOrigin });
  if (!intent.ok) {
    $("pairStatus").textContent = "could not prepare relay permission.";
    return;
  }
  let granted;
  try {
    granted = await chrome.permissions.request({ origins: [origin] });
  } catch (_e) {
    await cmd({ cmd: "relayIntentClear" });
    $("pairStatus").textContent = "could not request relay permission.";
    return;
  }
  if (!granted) {
    await cmd({ cmd: "relayIntentClear" });
    $("pairStatus").textContent = "permission declined — remote home not paired.";
    return;
  }
  $("pairStatus").textContent = "pairing…";
  const res = await cmd({ cmd: "pairRemote", link });
  if (res && res.ok) {
    $("pairLink").value = "";
    $("pairStatus").textContent = `paired to ${res.instanceId}.`;
  } else {
    $("pairStatus").textContent = "pairing failed: " + ((res && res.error) || "unknown error");
  }
  await refresh();
}

$("connForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  await saveConfig();
});

$("registerBtn").addEventListener("click", async () => {
  $("connStatus").textContent = "connecting…";
  await cmd({ cmd: "probe" });
  await refresh();
});

$("flushBtn").addEventListener("click", async () => {
  const res = await cmd({ cmd: "flushNow" });
  if (res.outcome === "failed") {
    await refresh();
    renderConnStatus();
    return;
  }
  await refresh();
  $("connStatus").textContent = res.outcome === "uploaded" ? "sent." : res.outcome === "queued" ? "can't reach your journal — kept here, waiting to sync." : "nothing waiting.";
});

$("showPageIndicator").addEventListener("change", async () => {
  await cmd({ cmd: "setConfig", showPageIndicator: $("showPageIndicator").checked });
});

$("addForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  await addSite();
});

$("pairForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  await pairRemote();
});

$("unpairBtn").addEventListener("click", async () => {
  await cmd({ cmd: "unpairRemote" });
  $("pairStatus").textContent = "unpaired.";
  await refresh();
});

refresh();
