// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

(function () {
  "use strict";

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
        origin: parsed.origin,
        host: parsed.host,
        ok: parsed.protocol === "http:" || parsed.protocol === "https:",
      };
    } catch (_error) {
      return { origin: "", host: "", ok: false };
    }
  }

  let state = null;
  let page = { origin: "", host: "", ok: false };
  let disclosureResolve = null;
  let previousActiveElement = null;

  function showActionMessage(message) {
    $("actionMessage").textContent = message || "";
  }

  function showActionError(error) {
    showActionMessage(Failures.classify(error, state));
  }

  function openSettings() {
    showActionMessage("");
    chrome.runtime.openOptionsPage();
  }

  async function runAction(action) {
    if (!action) return;
    showActionMessage("");
    if (action.id === "open-settings" || action.id === "get-app" || action.id === "finish-setup") {
      openSettings();
    } else if (action.id === "update-now") {
      const fresh = await cmd({ cmd: "getState" });
      if (fresh && fresh.updateCheck === "update-available") {
        chrome.runtime.reload();
      } else {
        await refresh();
      }
    } else if (action.id === "dismiss-loss") {
      await cmd({ cmd: "dismissLoss", seq: action.seq || (state && state.lossNotice && state.lossNotice.seq) });
      await refresh();
    } else if (action.id === "allow-again") {
      const result = await View.grantSite(action.host, siteEffects());
      if (result.denied) showActionMessage("permission declined. this site stays paused.");
      else if (result.error) showActionError(result.error);
      await refresh();
    } else if (action.id === "dismiss-truncation") {
      await cmd({ cmd: "dismissTruncation", origin: action.origin || action.host, bound: action.bound });
      await refresh();
    } else if (action.id === "remove-site") {
      const origin = action.origin || (action.host && action.host.startsWith("http") ? action.host : `https://${action.host}`);
      const result = await cmd({ cmd: "removeGrantedOrigin", origin });
      if (result.error) showActionError(result.error);
      await refresh();
    }
  }

  function renderVerdict(section) {
    if (!section) return;
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
      button.addEventListener("click", () => runAction(section.action));
      actions.append(button);
    }
  }

  function siteEffects() {
    return {
      cmd,
      requestPermission: (request) => chrome.permissions.request(request),
    };
  }

  function renderSiteIssues(section) {
    const block = $("siteIssues");
    const rows = $("siteIssueRows");
    rows.replaceChildren();
    if (!section || !section.rows || section.rows.length === 0) {
      block.hidden = true;
      return;
    }
    block.hidden = false;
    for (const row of section.rows) {
      const item = document.createElement("div");
      item.className = "site-issue";
      if (row.isAlso) {
        const h = document.createElement("div");
        h.className = "h";
        h.textContent = row.headline;
        item.append(h);
      } else {
        const host = document.createElement("div");
        host.className = "h";
        host.textContent = row.host;
        const why = document.createElement("div");
        why.className = "w";
        why.textContent = row.label;
        item.append(host, why);
      }
      if (row.action) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = row.action.label;
        button.addEventListener("click", () => runAction(row.action));
        item.append(button);
      }
      rows.append(item);
    }
  }

  async function runPageSiteAction(action) {
    showActionMessage("");
    if (action.id === "remove-site") {
      const origin = page.origin || `https://${page.host}`;
      const result = await cmd({ cmd: "removeGrantedOrigin", origin });
      if (result.error) showActionError(result.error);
      await refresh();
      return;
    }
    const result = await View.addSite(page.origin || page.host, Object.assign(siteEffects(), {
      disclose: presentDisclosure,
    }));
    if (result.cancelled) return;
    if (result.denied) showActionMessage("permission declined. nothing added.");
    else if (result.error) showActionError(result.error);
    await refresh();
  }

  function renderPage(section) {
    if (!section) return;
    $("pageHost").textContent = section.host;
    $("currentPageState").textContent = section.state;

    const siteAction = $("pageSiteAction");
    siteAction.textContent = section.siteAction.label;
    siteAction.disabled = section.siteAction.disabled;
    siteAction.className = section.siteAction.primary ? "primary" : "";
    siteAction.onclick = () => runPageSiteAction(section.siteAction);

    const pauseAction = $("pauseAction");
    pauseAction.hidden = !section.pauseAction;
    if (section.pauseAction) {
      pauseAction.textContent = section.pauseAction.label;
      pauseAction.className = section.pauseAction.primary ? "primary" : "";
      pauseAction.onclick = async () => {
        showActionMessage("");
        const result = await cmd({ cmd: "setPaused", paused: !state.paused });
        if (result.error) showActionError(result.error);
        await refresh();
      };
    }
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
    if (previousActiveElement && typeof previousActiveElement.focus === "function") {
      previousActiveElement.focus();
    }
    resolve(confirmed);
  }

  function presentDisclosure(host) {
    previousActiveElement = document.activeElement;
    const copy = Disclosure.addSite(host, state);
    $("disclosureTitle").textContent = copy.title;
    $("disclosureWhat").textContent = copy.what;
    $("disclosureUnsent").textContent = copy.unsent;
    $("disclosureDestination").textContent = copy.destination;
    $("disclosureDestinationDetail").textContent = copy.destinationDetail;
    $("disclosureChrome").textContent = copy.browser;
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
    const current = tab && tab.url ? originFor(tab.url) : { origin: "", host: "", ok: false };
    page = { origin: current.origin, host: current.host, ok: current.ok };
    const extras = {
      anyGrantedTabOpen: !!tab,
      openTabOrigins: tab && tab.url ? [current.origin] : [],
    };
    const derived = Status.derive(state, extras);
    const sections = View.arrange(derived, state, page, extras);
    renderVerdict(sections.find((section) => section.id === "verdict"));
    renderSiteIssues(sections.find((section) => section.id === "siteIssues"));
    renderPage(sections.find((section) => section.id === "page"));
    renderSiteCount(sections.find((section) => section.id === "siteCount"));
    if ($("headerMark")) {
      $("headerMark").src = `brand/mark-${derived.mark || "healthy"}.svg`;
    }
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

  try {
    const port = chrome.runtime.connect({ name: "status" });
    port.onMessage.addListener((msg) => {
      if (msg && msg.topic === "status") refresh();
    });
    port.onDisconnect.addListener(() => {
      refresh();
    });
  } catch (_e) {}

  globalThis.SolstonePopup = { refresh };
  refresh();
})();
