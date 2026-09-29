// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

(function () {
  "use strict";

  const Hosts = globalThis.SolstoneHosts;
  const Status = globalThis.SolstoneStatus;
  const Failures = globalThis.SolstoneFailures;
  const Disclosure = globalThis.SolstoneDisclosure;
  const View = globalThis.SolstonePopupView;
  const $ = (id) => document.getElementById(id);
  const cmd = (message) => new Promise((resolve) => chrome.runtime.sendMessage(message, (response) => resolve(response || {})));

  let state = null;
  let disclosureResolve = null;
  let lastConnectionSignature = null;
  let renderedOnce = false;

  function normHost(input) {
    let host = input.trim();
    try {
      if (/^https?:\/\//.test(host)) host = new URL(host).host;
    } catch (_error) {
      /* leave as typed */
    }
    return host.replace(/\/.*$/, "").toLowerCase();
  }

  function announce(message, tone = "") {
    const region = $("actionMessage");
    if (!region) return;
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

  function renderFirstRun() {
    const allowlist = Array.isArray(state && state.allowlist)
      ? state.allowlist
      : Array.isArray(state && state.grantedOrigins)
      ? state.grantedOrigins
      : null;
    const firstRun = $("firstRun");
    if (!firstRun) return;
    firstRun.hidden = !allowlist || allowlist.length !== 0;
    if (firstRun.hidden) return;

    const copy = Disclosure.firstRun(state);
    if ($("firstRunHeading")) $("firstRunHeading").textContent = copy.kinship[0];
    if ($("firstRunComposition")) $("firstRunComposition").textContent = copy.kinship[1];
    if ($("firstRunCovenant")) $("firstRunCovenant").textContent = copy.kinship[2];
    if ($("firstRunScope")) $("firstRunScope").textContent = copy.scope;
    if ($("firstRunWhat")) $("firstRunWhat").textContent = copy.whatSolTakesIn;
    if ($("firstRunUnsent")) $("firstRunUnsent").textContent = copy.unsentText;
    if ($("firstRunNever")) $("firstRunNever").textContent = copy.neverReceives;
    if ($("firstRunAbsolutes")) $("firstRunAbsolutes").textContent = copy.absolutes;
    if ($("firstRunDestination")) $("firstRunDestination").textContent = copy.destination.label;
    if ($("firstRunDestinationDetail")) $("firstRunDestinationDetail").textContent = copy.destination.detail;
    if ($("firstRunNothingYet")) $("firstRunNothingYet").textContent = copy.nothingYet;
  }

  function renderJournal(announceConnection) {
    const allowlist = Array.isArray(state && state.allowlist)
      ? state.allowlist
      : Array.isArray(state && state.grantedOrigins)
      ? state.grantedOrigins.map((o) => {
          try { return new URL(o).host; } catch (_e) { return o; }
        })
      : [];
    const entryMatchHosts = Object.fromEntries(allowlist.map((host) => [host, Hosts.matchHostFor(host)]));
    const verdict = Status.verdict(state, {
      activeSites: state && state.activeSites,
      outbox: state && state.outbox,
      entryMatchHosts,
    });
    const connection = Status.connection(state);

    if ($("journalLead")) $("journalLead").textContent = verdict.sub;
    if ($("journalStateChip")) {
      $("journalStateChip").textContent = verdict.headline;
      $("journalStateChip").className = `state-chip ${verdict.tone}`;
    }

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
      const origin = action.origin || (action.host.startsWith("http") ? action.host : `https://${action.host}`);
      const result = await cmd({ cmd: "removeGrantedOrigin", origin });
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
    if (!list) return;
    list.replaceChildren();
    const allowlist = Array.isArray(state && state.allowlist)
      ? state.allowlist
      : Array.isArray(state && state.grantedOrigins)
      ? state.grantedOrigins.map((o) => {
          try { return new URL(o).host; } catch (_e) { return o; }
        })
      : [];

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
    if ($("siteDisclosure")) $("siteDisclosure").hidden = true;
    if ($("sitesMain")) $("sitesMain").hidden = false;
    const resolve = disclosureResolve;
    disclosureResolve = null;
    if ($("newHost")) $("newHost").focus();
    resolve(confirmed);
  }

  function presentDisclosure(host) {
    const copy = Disclosure.addSite(host, state);
    if ($("siteDisclosureTitle")) $("siteDisclosureTitle").textContent = copy.title;
    if ($("siteDisclosureWhat")) $("siteDisclosureWhat").textContent = copy.whatSolTakesIn;
    if ($("siteDisclosureUnsent")) $("siteDisclosureUnsent").textContent = copy.unsentText;
    if ($("siteDisclosureDestination")) $("siteDisclosureDestination").textContent = copy.destination.label;
    if ($("siteDisclosureDestinationDetail")) $("siteDisclosureDestinationDetail").textContent = copy.destination.detail;
    if ($("siteDisclosureChrome")) $("siteDisclosureChrome").textContent = copy.whatChromeDoes;
    if ($("siteDisclosureConfirm")) $("siteDisclosureConfirm").textContent = copy.confirmLabel;
    if ($("siteDisclosureCancel")) $("siteDisclosureCancel").textContent = copy.cancelLabel;
    if ($("sitesMain")) $("sitesMain").hidden = true;
    if ($("siteDisclosure")) $("siteDisclosure").hidden = false;
    if ($("siteDisclosureConfirm")) $("siteDisclosureConfirm").focus();
    return new Promise((resolve) => {
      disclosureResolve = resolve;
    });
  }

  async function refresh(options = {}) {
    state = await cmd({ cmd: "getState" });
    if ($("showPageIndicator")) $("showPageIndicator").checked = !!state.showPageIndicator;
    if ($("ver")) $("ver").textContent = state.version ? `v${state.version}` : "";
    renderFirstRun();
    const rendered = renderJournal(options.announceConnection !== false);
    renderSites();
    renderedOnce = true;
    return rendered;
  }

  async function addSite() {
    clearAnnouncement();
    const raw = $("newHost") ? $("newHost").value : "";
    if (!Hosts.isValidHostInput(raw)) {
      announce("enter a site like mail.google.com", "bad");
      return;
    }
    const host = normHost(raw);
    const result = await View.addSite(host, Object.assign(siteEffects(), { disclose: presentDisclosure }));
    if (result.cancelled) return;
    if (result.ok && $("newHost")) $("newHost").value = "";
    await refresh({ announceConnection: false });
    if ($("newHost")) $("newHost").focus();
    if (result.denied) announce("permission declined. nothing added.", "bad");
    else if (result.error) showActionError(result.error);
    else if (result.ok) announce(`added ${host}. open or reload a tab on it to begin.`, "ok");
    else announce("could not add the site.", "bad");
  }

  if ($("firstRunChange")) {
    $("firstRunChange").addEventListener("click", () => {
      if ($("newHost")) $("newHost").focus();
    });
  }

  if ($("showPageIndicator")) {
    $("showPageIndicator").addEventListener("change", async () => {
      await cmd({ cmd: "setConfig", showPageIndicator: $("showPageIndicator").checked });
    });
  }

  if ($("addForm")) {
    $("addForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      await addSite();
    });
  }

  if ($("siteDisclosureConfirm")) {
    $("siteDisclosureConfirm").addEventListener("click", () => closeDisclosure(true));
  }
  if ($("siteDisclosureCancel")) {
    $("siteDisclosureCancel").addEventListener("click", () => closeDisclosure(false));
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && $("siteDisclosure") && !$("siteDisclosure").hidden) closeDisclosure(false);
  });

  globalThis.SolstoneOptions = { refresh };
  refresh();
})();
