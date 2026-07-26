// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

(function () {
  "use strict";

  const SolstoneHosts = globalThis.SolstoneHosts;
  const Status = globalThis.SolstoneStatus;
  const Failures = globalThis.SolstoneFailures;
  const Disclosure = globalThis.SolstoneDisclosure;
  const View = globalThis.SolstonePopupView;
  const $ = (id) => document.getElementById(id);

  const TONE = {
    ok: { bandClass: "ok", dotClass: "ok" },
    calm: { bandClass: "calm", dotClass: "neutral" },
    attention: { bandClass: "attention", dotClass: "bad" },
    unavailable: { bandClass: "unavailable", dotClass: "warn" },
  };

  function cmd(message) {
    return new Promise((resolve) => chrome.runtime.sendMessage(message, (response) => resolve(response || {})));
  }

  async function currentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab;
    } catch (_error) {
      return undefined;
    }
  }

  function originFor(url) {
    try {
      const parsed = new URL(url);
      return {
        host: parsed.host,
        ok: parsed.protocol === "http:" || parsed.protocol === "https:",
      };
    } catch (_error) {
      return { host: "", ok: false };
    }
  }

  let state = null;
  let page = { host: "", ok: false };
  let disclosureResolve = null;

  async function requestJournalAccess(journalUrl) {
    const origin = SolstoneHosts.permissionOriginForUrl(journalUrl);
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

  function showActionMessage(message) {
    $("actionMessage").textContent = message || "";
  }

  function showActionError(error) {
    showActionMessage(Failures.classify(error));
  }

  async function tryNow() {
    showActionMessage("");
    await cmd({ cmd: "probe" });
    await refresh();
  }

  async function dismiss() {
    showActionMessage("");
    await cmd({ cmd: "clearDropped" });
    await refresh();
  }

  function openSettings() {
    showActionMessage("");
    chrome.runtime.openOptionsPage();
  }

  async function setUp() {
    showActionMessage("");
    const origin = SolstoneHosts.permissionOriginForUrl(state.journalUrl);
    if (!origin) {
      openSettings();
      return;
    }
    const connection = Status.connection(state);
    if (!connection.kind.startsWith("local-")) {
      openSettings();
      return;
    }

    let granted;
    try {
      granted = await chrome.permissions.contains({ origins: [origin] });
    } catch (_error) {
      showActionMessage("could not check journal permission");
      return;
    }
    if (granted) {
      openSettings();
      return;
    }

    const result = await requestJournalAccess(state.journalUrl);
    if (!result.ok) {
      if (result.denied) showActionMessage("permission declined. journal address not allowed.");
      else if (result.workerError) showActionError(result.workerError);
      else showActionMessage(result.error || "could not request journal permission");
    }
    await refresh();
  }

  const ACTION = {
    "try-now": tryNow,
    dismiss: dismiss,
    "open-settings": openSettings,
    "set-up": setUp,
  };

  function renderVerdict(section) {
    const treatment = TONE[section.tone] || TONE.unavailable;
    const verdict = $("verdict");
    verdict.className = `verdict ${treatment.bandClass}`;
    $("verdictDot").className = `dot ${treatment.dotClass}`;
    $("verdictHeadline").textContent = section.headline;
    $("verdictSub").textContent = section.sub;
    $("verdictReason").textContent = section.reason;
    $("verdictReason").hidden = !section.reason;

    const actions = $("verdictActions");
    actions.replaceChildren();
    if (section.action) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = section.action.label;
      const handler = ACTION[section.action.id];
      if (handler) button.addEventListener("click", handler);
      actions.append(button);
    }
  }

  function siteEffects() {
    return {
      cmd,
      requestPermission: (request) => chrome.permissions.request(request),
    };
  }

  async function runSiteAction(action) {
    showActionMessage("");
    if (action.id === "remove-site") {
      const result = await cmd({ cmd: "removeSite", host: action.host });
      if (result.error) showActionError(result.error);
    } else if (action.id === "allow-site") {
      const result = await View.grantSite(action.host, siteEffects());
      if (result.denied) showActionMessage("permission declined. this site stays paused.");
      else if (result.error) showActionError(result.error);
    }
    await refresh();
  }

  function renderSiteIssues(section) {
    const block = $("siteIssues");
    const rows = $("siteIssueRows");
    rows.replaceChildren();
    if (!section) {
      block.hidden = true;
      return;
    }
    block.hidden = false;
    for (const row of section.rows) {
      const item = document.createElement("div");
      item.className = "site-issue";
      const host = document.createElement("div");
      host.className = "h";
      host.textContent = row.host;
      const why = document.createElement("div");
      why.className = "w";
      why.textContent = row.label;
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = row.action.label;
      button.addEventListener("click", () => runSiteAction(row.action));
      item.append(host, why, button);
      rows.append(item);
    }
  }

  async function runPageSiteAction(action) {
    showActionMessage("");
    if (action.id === "remove-site") {
      const result = await cmd({ cmd: "removeSite", host: page.host });
      if (result.error) showActionError(result.error);
      await refresh();
      return;
    }
    const result = await View.addSite(page.host, Object.assign(siteEffects(), {
      disclose: presentDisclosure,
    }));
    if (result.cancelled) return;
    if (result.denied) showActionMessage("permission declined. nothing added.");
    else if (result.error) showActionError(result.error);
    await refresh();
  }

  function renderPage(section) {
    $("pageHost").textContent = section.host;
    $("currentPageState").textContent = section.state;

    const siteAction = $("pageSiteAction");
    siteAction.textContent = section.siteAction.label;
    siteAction.disabled = section.siteAction.disabled;
    siteAction.className = section.siteAction.primary ? "primary" : "";
    siteAction.onclick = () => runPageSiteAction(section.siteAction);

    const pauseAction = $("pauseAction");
    pauseAction.textContent = section.pauseAction.label;
    pauseAction.className = section.pauseAction.primary ? "primary" : "";
    pauseAction.onclick = async () => {
      showActionMessage("");
      const result = await cmd({ cmd: "setPaused", paused: !state.paused });
      if (result.error) showActionError(result.error);
      await refresh();
    };
  }

  function renderSiteCount(section) {
    $("siteCount").hidden = !section;
    if (section) $("siteCountText").textContent = section.text;
  }

  function closeDisclosure(confirmed) {
    if (!disclosureResolve) return;
    $("disclosure").hidden = true;
    $("popupMain").hidden = false;
    $("popupFooter").hidden = false;
    const resolve = disclosureResolve;
    disclosureResolve = null;
    resolve(confirmed);
  }

  function presentDisclosure(host) {
    const copy = Disclosure.addSite(host, state);
    $("disclosureTitle").textContent = copy.title;
    $("disclosureWhat").textContent = copy.whatSolTakesIn;
    $("disclosureDestination").textContent = copy.destination.label;
    $("disclosureDestinationDetail").textContent = copy.destination.detail;
    $("disclosureChrome").textContent = copy.whatChromeDoes;
    $("disclosureConfirm").textContent = copy.confirmLabel;
    $("disclosureCancel").textContent = copy.cancelLabel;
    $("popupMain").hidden = true;
    $("popupFooter").hidden = true;
    $("disclosure").hidden = false;
    $("disclosureConfirm").focus();
    return new Promise((resolve) => {
      disclosureResolve = resolve;
    });
  }

  async function refresh() {
    state = await cmd({ cmd: "getState" });
    const tab = await currentTab();
    const current = tab && tab.url ? originFor(tab.url) : { host: "", ok: false };
    page = { host: current.host, ok: current.ok };
    const allowlist = Array.isArray(state.allowlist) ? state.allowlist : [];
    const entryMatchHosts = Object.fromEntries(allowlist.map((h) => [h, SolstoneHosts.matchHostFor(h)]));
    const verdict = Status.verdict(state, {
      activeSites: state.activeSites,
      outbox: state.outbox,
      entryMatchHosts,
    });
    const sections = View.arrange(verdict, state, page);
    renderVerdict(sections.find((section) => section.id === "verdict"));
    renderSiteIssues(sections.find((section) => section.id === "siteIssues"));
    renderPage(sections.find((section) => section.id === "page"));
    renderSiteCount(sections.find((section) => section.id === "siteCount"));
  }

  $("disclosureConfirm").addEventListener("click", () => closeDisclosure(true));
  $("disclosureCancel").addEventListener("click", () => closeDisclosure(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("disclosure").hidden) closeDisclosure(false);
  });
  $("allSitesLink").addEventListener("click", (event) => {
    event.preventDefault();
    openSettings();
  });
  $("settingsLink").addEventListener("click", (event) => {
    event.preventDefault();
    openSettings();
  });

  globalThis.SolstonePopup = { refresh };
  refresh();
})();
