// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
//
// options.js — full settings: journal connection, connect, and the opt-in
// allowlist manager. Browser-side removal pauses a site as "paused by browser";
// the remove button forgets it.

const $ = (id) => document.getElementById(id);
const cmd = (m) => new Promise((r) => chrome.runtime.sendMessage(m, (x) => r(x || {})));
const esc = (s) => globalThis.SolstoneEscape.escapeHtml(s);

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

function renderConnStatus() {
  const h = state.health || {};
  const conn = globalThis.SolstoneStatus.connection(state);
  const cs = $("connStatus");
  const summary = `${esc(conn.stateLabel)} · ${esc(conn.destinationDetail)}`;
  if (conn.connected) {
    const up = h.lastUploadAt ? new Date(h.lastUploadAt).toLocaleTimeString() : "none yet";
    cs.innerHTML = `<span class="pill ok">${summary}</span> · ${h.segmentsUploaded || 0} sent · last ${esc(up)}`;
  } else if (conn.kind.endsWith("-error")) {
    cs.innerHTML = `<span class="pill bad">${summary}</span> · <span title="${esc(h.lastError)}">${esc(conn.consequence)}</span>`;
  } else if (conn.consequence) {
    cs.innerHTML = `<span class="pill">${summary}</span> · <span>${esc(conn.consequence)}</span>`;
  } else if (conn.kind === "local-pending") {
    cs.innerHTML = `<span class="pill">${summary}</span> · add your journal address and save`;
  } else {
    cs.innerHTML = `<span class="pill">${summary}</span>`;
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
    return { ok: false, denied: true, added: intent.added, intentOk: true };
  }
  const res = await cmd({ cmd: "siteGranted", host });
  return Object.assign({}, res, { added: intent.added, intentOk: true });
}

async function requestJournalAccess(journalUrl) {
  const origin = globalThis.SolstoneHosts.permissionOriginForUrl(journalUrl);
  if (!origin) return { ok: false, error: "enter a valid journal address" };
  // The intent must land before request: permissions.onAdded can reconcile as
  // soon as Chrome grants access and would otherwise see/release the old URL.
  const intent = await cmd({ cmd: "journalIntent", journalUrl });
  if (!intent.ok) return { ok: false, error: intent.error || "could not save the journal address" };

  let requestError = false;
  try {
    await chrome.permissions.request({ origins: [origin] });
  } catch (_e) {
    requestError = true;
  }
  const resolved = await cmd({
    cmd: "journalIntentResolve",
    journalUrl: intent.journalUrl,
    changed: intent.changed,
    previous: intent.previous,
  });
  if (!resolved.ok) return { ok: false, error: resolved.error || "could not finish journal permission" };
  if (!resolved.granted) {
    return requestError
      ? { ok: false, error: "could not request journal permission" }
      : { ok: false, denied: true };
  }
  return { ok: true };
}

function renderRemoteState() {
  const remote = state.remote || {};
  $("unpairBtn").hidden = !remote.paired;
  if (remote.paired) {
    $("remoteState").textContent = `paired to ${remote.instanceId || "remote home"} via ${remote.relayOrigin || "relay"}.`;
  } else if (remote.pending) {
    $("remoteState").textContent = `pairing via ${remote.relayOrigin || "relay"}.`;
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
  $("streamLabel").textContent = state.streamName;
  renderConnStatus();
  renderJournalLink();
  renderRemoteState();
  await renderWaiting();

  const list = $("siteList");
  if (state.allowlist.length) {
    list.innerHTML = state.allowlist
      .map((h) => {
        const host = esc(h);
        const row = globalThis.SolstoneStatus.siteRowState(h, Object.assign({}, state, {
          matchHost: globalThis.SolstoneHosts.matchHostFor(h),
          pageHost: null,
        }));
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
        if (res.denied) $("addStatus").textContent = "permission declined — site stays paused.";
        else if (res.error) $("addStatus").textContent = "could not allow: " + res.error;
        else if (res.ok === true) $("addStatus").textContent = "allowed again.";
        else $("addStatus").textContent = "could not allow the site.";
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
  const permission = await requestJournalAccess(journalUrl);
  if (!permission.ok) {
    await refresh();
    $("connStatus").textContent = permission.denied
      ? "permission declined. journal address unchanged."
      : permission.error || "could not request journal permission";
    return;
  }
  await cmd({ cmd: "setConfig", hostname, journalUrl, segmentSec });
  $("connStatus").textContent = "connecting…";
  await cmd({ cmd: "probe" });
  await refresh();
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
  if (res && res.error) $("addStatus").textContent = "could not add: " + res.error;
  else if (res && res.ok === true) $("addStatus").textContent = `added ${host}. open or reload a tab on it to begin.`;
  else $("addStatus").textContent = "could not add the site.";
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
  const origin = globalThis.SolstoneHosts.permissionOriginForUrl(parsed.relayOrigin);
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
  const permission = await requestJournalAccess($("journalUrl").value);
  if (!permission.ok) {
    await refresh();
    $("connStatus").textContent = permission.denied
      ? "permission declined. journal address unchanged."
      : permission.error || "could not request journal permission";
    return;
  }
  $("connStatus").textContent = "connecting…";
  await cmd({ cmd: "probe" });
  await refresh();
});

$("flushBtn").addEventListener("click", async () => {
  const res = await cmd({ cmd: "flushNow" });
  await refresh();
  if (res.outcome === "failed") return;
  const conn = globalThis.SolstoneStatus.connection(state);
  if (res.outcome === "uploaded") $("connStatus").textContent = "sent.";
  else if (res.outcome === "queued" && conn.consequence) $("connStatus").textContent = conn.consequence;
  else if (res.outcome !== "queued") $("connStatus").textContent = "nothing waiting.";
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
