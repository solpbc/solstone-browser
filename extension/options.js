// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

(function () {
  "use strict";

  const Hosts = globalThis.SolstoneHosts;
  const Status = globalThis.SolstoneStatus;
  const Pairlink = globalThis.SolstonePairlink;
  const Failures = globalThis.SolstoneFailures;
  const Disclosure = globalThis.SolstoneDisclosure;
  const View = globalThis.SolstonePopupView;
  const $ = (id) => document.getElementById(id);
  const cmd = (message) => new Promise((resolve) => chrome.runtime.sendMessage(message, (response) => resolve(response || {})));

  let state = null;
  let disclosureResolve = null;
  let destinationOverride = null;
  let lastConnectionSignature = null;
  let renderedOnce = false;

  function normHost(input) {
    let host = input.trim();
    try {
      if (/^https?:\/\//.test(host)) host = new URL(host).host;
    } catch (_error) {
      // Leave the value as typed so the shared validation can reject it.
    }
    return host.replace(/\/.*$/, "").toLowerCase();
  }

  function announce(message, tone = "") {
    const region = $("actionMessage");
    const next = message || "";
    const className = `action-message${next && tone ? ` ${tone}` : ""}`;
    if (region.textContent !== next) region.textContent = next;
    if (region.className !== className) region.className = className;
  }

  function clearAnnouncement() {
    announce("");
  }

  function showActionError(error, status) {
    announce(Failures.classify(error, status), "bad");
  }

  function siteEffects() {
    return {
      cmd,
      requestPermission: (request) => chrome.permissions.request(request),
    };
  }

  async function requestJournalAccess(journalUrl) {
    const origin = Hosts.permissionOriginForUrl(journalUrl);
    if (!origin) return { ok: false, error: "enter a valid journal address" };
    const intent = await cmd({ cmd: "journalIntent", journalUrl });
    if (!intent.ok) {
      return intent.error
        ? { ok: false, workerError: intent.error }
        : { ok: false, error: "could not save the journal address" };
    }

    let requestError = false;
    try {
      await chrome.permissions.request({ origins: [origin] });
    } catch (_error) {
      requestError = true;
    }
    const resolved = await cmd({
      cmd: "journalIntentResolve",
      journalUrl: intent.journalUrl,
      changed: intent.changed,
      previous: intent.previous,
    });
    if (!resolved.ok) {
      return resolved.error
        ? { ok: false, workerError: resolved.error }
        : { ok: false, error: "could not finish journal permission" };
    }
    if (!resolved.granted) {
      return requestError
        ? { ok: false, error: "could not request journal permission" }
        : { ok: false, denied: true };
    }
    return { ok: true };
  }

  function renderFirstRun() {
    const allowlist = Array.isArray(state && state.allowlist) ? state.allowlist : null;
    const firstRun = $("firstRun");
    firstRun.hidden = !allowlist || allowlist.length !== 0;
    if (firstRun.hidden) return;

    const copy = Disclosure.firstRun(state);
    $("firstRunHeading").textContent = copy.kinship[0];
    $("firstRunComposition").textContent = copy.kinship[1];
    $("firstRunCovenant").textContent = copy.kinship[2];
    $("firstRunScope").textContent = copy.scope;
    $("firstRunWhat").textContent = copy.whatSolTakesIn;
    $("firstRunNever").textContent = copy.neverReceives;
    $("firstRunAbsolutes").textContent = copy.absolutes;
    $("firstRunDestination").textContent = copy.destination.label;
    $("firstRunDestinationDetail").textContent = copy.destination.detail;
    $("firstRunNothingYet").textContent = copy.nothingYet;
  }

  function selectedDestination() {
    return $("destinationRemote").checked ? "remote" : "local";
  }

  function showDestination(selection) {
    const remote = selection === "remote";
    $("destinationLocal").checked = !remote;
    $("destinationRemote").checked = remote;
    $("localDestination").hidden = remote;
    $("remoteDestination").hidden = !remote;
  }

  function renderDestination(connection) {
    const derived = connection.kind.startsWith("remote-") ? "remote" : "local";
    if (destinationOverride === derived) destinationOverride = null;
    showDestination(destinationOverride || derived);
  }

  function replaceLabeledDetail(id, label, value) {
    const row = $(id);
    row.replaceChildren();
    row.hidden = !value;
    if (!value) return;
    const key = document.createElement("span");
    key.className = "key";
    key.textContent = label;
    const text = document.createElement("span");
    text.textContent = value;
    row.append(key, text);
  }

  function renderProvenance() {
    const remote = (state && state.remote) || {};
    const health = (state && state.health) || {};
    replaceLabeledDetail("pairInstanceId", "paired home", remote.instanceId || "");
    replaceLabeledDetail("pairRelayOrigin", "relay", remote.relayOrigin || "");
    replaceLabeledDetail(
      "journalError",
      "last problem",
      health.lastError ? Failures.classify(health.lastError, health.lastStatus) : "",
    );

    let lastSync = "";
    if (health.lastUploadAt) lastSync = new Date(health.lastUploadAt).toLocaleString();
    if (Number(health.segmentsUploaded || 0) > 0) {
      const batches = `${health.segmentsUploaded} batch${health.segmentsUploaded === 1 ? "" : "es"} sent`;
      lastSync = lastSync ? `${lastSync}. ${batches}.` : `${batches}.`;
    }
    replaceLabeledDetail("lastSyncDetail", "last sync", lastSync);
  }

  function appendWaitingHost(entry, body) {
    if (Number(entry.count || 0) <= 0) return;
    const wrap = document.createElement("div");
    wrap.className = "waiting-host";
    const head = document.createElement("strong");
    head.textContent = `${entry.host} · ${entry.count} update${entry.count === 1 ? "" : "s"}`;
    wrap.append(head);
    if (Array.isArray(entry.texts) && entry.texts.length > 0) {
      const list = document.createElement("ul");
      for (const value of entry.texts) {
        const item = document.createElement("li");
        item.textContent = value;
        list.append(item);
      }
      wrap.append(list);
    }
    body.append(wrap);
  }

  function renderWaiting(preview) {
    preview = preview || {};
    const total = Math.max(0, Number(preview.waiting || 0));
    const row = $("waitingRow");
    const body = $("waitingPreview");
    body.replaceChildren();
    row.hidden = total === 0;
    if (total > 0) {
      const summary = document.createElement("div");
      summary.textContent = `${total} update${total === 1 ? "" : "s"} waiting to sync.`;
      body.append(summary);
      const outboxLines = Math.max(0, Number((preview.outbox && preview.outbox.lines) || 0));
      if (outboxLines > 0) {
        const earlier = document.createElement("div");
        earlier.className = "muted";
        earlier.textContent = `${outboxLines} update${outboxLines === 1 ? "" : "s"} from earlier.`;
        body.append(earlier);
      }
      for (const entry of preview.perHost || []) appendWaitingHost(entry, body);
    }

    const dropped = preview.dropped || {};
    const loss = $("lossDetail");
    loss.replaceChildren();
    loss.hidden = Number(dropped.segments || 0) <= 0;
    if (!loss.hidden) {
      const headline = document.createElement("strong");
      headline.textContent = "some updates couldn't be kept";
      const figure = document.createElement("div");
      const lines = Math.max(0, Number(dropped.lines || 0));
      figure.textContent = `${lines} update${lines === 1 ? "" : "s"}`;
      loss.append(headline, figure);
      if (!Number((preview.outbox && preview.outbox.lines) || 0)) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "dismiss";
        button.addEventListener("click", async () => {
          clearAnnouncement();
          await cmd({ cmd: "clearDropped" });
          await refresh({ announceConnection: false });
        });
        loss.append(button);
      }
    }
  }

  function renderJournal(preview, announceConnection) {
    const allowlist = Array.isArray(state && state.allowlist) ? state.allowlist : [];
    const entryMatchHosts = Object.fromEntries(allowlist.map((host) => [host, Hosts.matchHostFor(host)]));
    const verdict = Status.verdict(state, {
      activeSites: state && state.activeSites,
      outbox: state && state.outbox,
      entryMatchHosts,
    });
    const connection = Status.connection(state);

    $("journalLead").textContent = verdict.sub;
    $("journalStateChip").textContent = verdict.headline;
    $("journalStateChip").className = `state-chip ${verdict.tone}`;
    renderDestination(connection);

    const link = $("journalLink");
    const showLink = !!(state && state.journalUrl) && connection.kind.startsWith("local-");
    link.hidden = !showLink;
    if (showLink) link.href = state.journalUrl;
    else link.removeAttribute("href");
    $("unpairBtn").hidden = !(state && state.remote && state.remote.paired);

    renderProvenance();
    renderWaiting(preview);

    const signature = [connection.kind, verdict.headline, verdict.sub, verdict.reason].join("|");
    if (renderedOnce && announceConnection && lastConnectionSignature !== signature) {
      const tone = verdict.tone === "ok" ? "ok" : verdict.tone === "attention" ? "bad" : "";
      announce([verdict.headline, verdict.sub].filter(Boolean).join(". "), tone);
    }
    lastConnectionSignature = signature;
    return { connection, verdict };
  }

  async function runSiteAction(action) {
    clearAnnouncement();
    if (action.id === "remove-site") {
      const result = await cmd({ cmd: "removeSite", host: action.host });
      await refresh({ announceConnection: false });
      if (result.error) showActionError(result.error);
      else announce(`removed ${action.host}.`, "ok");
      return;
    }

    const result = await View.grantSite(action.host, siteEffects());
    await refresh({ announceConnection: false });
    if (result.denied) announce("permission declined. this site stays paused.", "bad");
    else if (result.error) showActionError(result.error);
    else if (result.ok) announce("allowed again.", "ok");
    else announce("could not allow the site.", "bad");
  }

  function renderSites() {
    const list = $("siteList");
    list.replaceChildren();
    const allowlist = Array.isArray(state && state.allowlist) ? state.allowlist : [];
    for (const entry of allowlist) {
      const rowState = Status.siteRowState(entry, Object.assign({}, state, {
        matchHost: Hosts.matchHostFor(entry),
        pageHost: null,
      }));
      const row = document.createElement("div");
      row.className = "site";
      const copy = document.createElement("div");
      copy.className = "site-copy";
      const host = document.createElement("div");
      host.className = "site-host";
      host.textContent = entry;
      const status = document.createElement("div");
      status.className = `site-state${rowState.kind === "on" ? " ok" : rowState.kind === "error" ? " bad" : ""}`;
      status.textContent = rowState.kind === "error" ? Failures.classify(rowState.label) : rowState.label;
      copy.append(host, status);

      const actions = document.createElement("div");
      actions.className = "site-actions";
      if (rowState.kind === "paused-browser") {
        const allow = document.createElement("button");
        allow.type = "button";
        allow.textContent = "allow again";
        allow.addEventListener("click", async () => {
          allow.disabled = true;
          await runSiteAction({ id: "allow-site", host: entry });
        });
        actions.append(allow);
      }
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "remove";
      remove.addEventListener("click", () => runSiteAction({ id: "remove-site", host: entry }));
      actions.append(remove);
      row.append(copy, actions);
      list.append(row);
    }
  }

  function closeDisclosure(confirmed) {
    if (!disclosureResolve) return;
    $("siteDisclosure").hidden = true;
    $("sitesMain").hidden = false;
    const resolve = disclosureResolve;
    disclosureResolve = null;
    $("newHost").focus();
    resolve(confirmed);
  }

  function presentDisclosure(host) {
    const copy = Disclosure.addSite(host, state);
    $("siteDisclosureTitle").textContent = copy.title;
    $("siteDisclosureWhat").textContent = copy.whatSolTakesIn;
    $("siteDisclosureDestination").textContent = copy.destination.label;
    $("siteDisclosureDestinationDetail").textContent = copy.destination.detail;
    $("siteDisclosureChrome").textContent = copy.whatChromeDoes;
    $("siteDisclosureConfirm").textContent = copy.confirmLabel;
    $("siteDisclosureCancel").textContent = copy.cancelLabel;
    $("sitesMain").hidden = true;
    $("siteDisclosure").hidden = false;
    $("siteDisclosureConfirm").focus();
    return new Promise((resolve) => {
      disclosureResolve = resolve;
    });
  }

  async function refresh(options = {}) {
    state = await cmd({ cmd: "getState" });
    const preview = await cmd({ cmd: "getBufferedPreview" });
    $("hostname").value = state.hostname || "";
    $("journalUrl").value = state.journalUrl || "";
    $("segmentSec").value = state.segmentSec || 300;
    $("showPageIndicator").checked = !!state.showPageIndicator;
    $("ver").textContent = state.version ? `v${state.version}` : "";
    $("streamLabel").textContent = state.streamName || "browser";
    renderFirstRun();
    const rendered = renderJournal(preview, options.announceConnection !== false);
    renderSites();
    renderedOnce = true;
    return rendered;
  }

  async function saveConfig() {
    clearAnnouncement();
    const segmentSec = Number.parseInt($("segmentSec").value, 10);
    if (Number.isNaN(segmentSec) || segmentSec < 30) {
      announce("minimum 30 seconds", "bad");
      return;
    }

    const hostname = $("hostname").value;
    const local = selectedDestination() === "local";
    const journalUrl = local ? $("journalUrl").value : String((state && state.journalUrl) || "");
    if (local) {
      const permission = await requestJournalAccess(journalUrl);
      if (!permission.ok) {
        await refresh({ announceConnection: false });
        if (permission.denied) announce("permission declined. journal address unchanged.", "bad");
        else if (permission.workerError) showActionError(permission.workerError);
        else announce(permission.error || "could not request journal permission", "bad");
        return;
      }
    }
    await cmd({ cmd: "setConfig", hostname, journalUrl, segmentSec });
    await cmd({ cmd: "probe" });
    await refresh({ announceConnection: false });
    announce("settings saved.", "ok");
  }

  async function addSite() {
    clearAnnouncement();
    const raw = $("newHost").value;
    if (!Hosts.isValidHostInput(raw)) {
      announce("enter a site like mail.google.com", "bad");
      return;
    }
    const host = normHost(raw);
    const result = await View.addSite(host, Object.assign(siteEffects(), { disclose: presentDisclosure }));
    if (result.cancelled) return;
    if (result.ok) $("newHost").value = "";
    await refresh({ announceConnection: false });
    $("newHost").focus();
    if (result.denied) announce("permission declined. nothing added.", "bad");
    else if (result.error) showActionError(result.error);
    else if (result.ok) announce(`added ${host}. open or reload a tab on it to begin.`, "ok");
    else announce("could not add the site.", "bad");
  }

  async function pairRemote() {
    clearAnnouncement();
    const link = $("pairLink").value.trim();
    let parsed;
    try {
      parsed = Pairlink.parseLink(link);
    } catch (_error) {
      announce("paste a valid pair link.", "bad");
      return;
    }
    const origin = Hosts.permissionOriginForUrl(parsed.relayOrigin);
    const intent = await cmd({ cmd: "relayIntent", relayOrigin: parsed.relayOrigin });
    if (!intent.ok) {
      announce("could not prepare relay permission.", "bad");
      return;
    }
    let granted;
    try {
      granted = await chrome.permissions.request({ origins: [origin] });
    } catch (_error) {
      await cmd({ cmd: "relayIntentClear" });
      announce("could not request relay permission.", "bad");
      return;
    }
    if (!granted) {
      await cmd({ cmd: "relayIntentClear" });
      announce("permission declined. your home was not paired.", "bad");
      return;
    }
    const result = await cmd({ cmd: "pairRemote", link });
    if (result.ok) $("pairLink").value = "";
    await refresh({ announceConnection: false });
    if (result.ok) announce("paired to your home.", "ok");
    else showActionError(result.error || "pairing failed");
  }

  $("destinationLocal").addEventListener("change", () => {
    if (!$("destinationLocal").checked) return;
    destinationOverride = "local";
    showDestination("local");
  });
  $("destinationRemote").addEventListener("change", () => {
    if (!$("destinationRemote").checked) return;
    destinationOverride = "remote";
    showDestination("remote");
  });
  $("firstRunChange").addEventListener("click", () => {
    const selected = selectedDestination() === "remote" ? $("destinationRemote") : $("destinationLocal");
    selected.focus();
  });

  $("connForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveConfig();
  });
  $("registerBtn").addEventListener("click", async () => {
    clearAnnouncement();
    const permission = await requestJournalAccess($("journalUrl").value);
    if (!permission.ok) {
      await refresh({ announceConnection: false });
      if (permission.denied) announce("permission declined. journal address unchanged.", "bad");
      else if (permission.workerError) showActionError(permission.workerError);
      else announce(permission.error || "could not request journal permission", "bad");
      return;
    }
    await cmd({ cmd: "probe" });
    const rendered = await refresh({ announceConnection: false });
    const tone = rendered.connection.connected
      ? "ok"
      : rendered.connection.kind.endsWith("-error") ? "bad" : "";
    announce(rendered.connection.stateLabel, tone);
  });
  $("flushBtn").addEventListener("click", async () => {
    clearAnnouncement();
    const result = await cmd({ cmd: "flushNow" });
    const rendered = await refresh({ announceConnection: false });
    if (result.outcome === "uploaded") announce("sent.", "ok");
    else if (result.outcome === "queued" && rendered.connection.consequence) announce(rendered.connection.consequence);
    else if (result.outcome === "queued") announce("kept here, waiting to sync.");
    else if (result.outcome === "failed") showActionError((state.health && state.health.lastError) || result.error || "send failed");
    else announce("nothing waiting.");
  });
  $("showPageIndicator").addEventListener("change", async () => {
    await cmd({ cmd: "setConfig", showPageIndicator: $("showPageIndicator").checked });
  });
  $("addForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await addSite();
  });
  $("pairForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await pairRemote();
  });
  $("unpairBtn").addEventListener("click", async () => {
    clearAnnouncement();
    const result = await cmd({ cmd: "unpairRemote" });
    await refresh({ announceConnection: false });
    if (result.error) showActionError(result.error);
    else announce("unpaired.", "ok");
  });
  $("siteDisclosureConfirm").addEventListener("click", () => closeDisclosure(true));
  $("siteDisclosureCancel").addEventListener("click", () => closeDisclosure(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("siteDisclosure").hidden) closeDisclosure(false);
  });

  globalThis.SolstoneOptions = { refresh };
  refresh();
})();
