// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

(function () {
  "use strict";

  const Hosts = globalThis.SolstoneHosts;
  const Status = globalThis.SolstoneStatus;
  const Failures = globalThis.SolstoneFailures;
  const Disclosure = globalThis.SolstoneDisclosure;
  const Copy = globalThis.SolstoneCopy;
  const View = globalThis.SolstonePopupView;
  const $ = (id) => document.getElementById(id);
  const cmd = (message) => new Promise((resolve) => chrome.runtime.sendMessage(message, (response) => resolve(response || {})));

  let state = null;
  let disclosureResolve = null;

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

  function showActionError(error) {
    announce(Failures.classify(error, state), "bad");
  }

  function siteEffects() {
    return {
      status: state,
      cmd,
      requestPermission: (request) => chrome.permissions.request(request),
    };
  }

  function closeDisclosure(confirmed) {
    if (!disclosureResolve) return;
    if ($("siteDisclosure")) $("siteDisclosure").hidden = true;
    if ($("sitesMain")) $("sitesMain").hidden = false;
    const resolve = disclosureResolve;
    disclosureResolve = null;
    if ($("newHost") && typeof $("newHost").focus === "function") $("newHost").focus();
    resolve(confirmed);
  }

  function presentDisclosure(host) {
    const copy = Disclosure.addSite(host, state);
    if ($("siteDisclosureTitle")) $("siteDisclosureTitle").textContent = copy.title;
    if ($("siteDisclosureWhat")) $("siteDisclosureWhat").textContent = copy.what;
    if ($("siteDisclosureUnsent")) $("siteDisclosureUnsent").textContent = copy.unsent;
    if ($("siteDisclosureDestination")) $("siteDisclosureDestination").textContent = copy.destination;
    if ($("siteDisclosureDestinationDetail")) $("siteDisclosureDestinationDetail").textContent = copy.destinationDetail;
    if ($("siteDisclosureChrome")) $("siteDisclosureChrome").textContent = copy.browser;
    if ($("siteDisclosureConfirm")) $("siteDisclosureConfirm").textContent = copy.confirmLabel;
    if ($("siteDisclosureCancel")) $("siteDisclosureCancel").textContent = copy.cancelLabel;
    if ($("sitesMain")) $("sitesMain").hidden = true;
    if ($("siteDisclosure")) $("siteDisclosure").hidden = false;
    if ($("siteDisclosureConfirm") && typeof $("siteDisclosureConfirm").focus === "function") {
      $("siteDisclosureConfirm").focus();
    }
    return new Promise((resolve) => {
      disclosureResolve = resolve;
    });
  }

  async function addSiteFromInput(inputElement) {
    clearAnnouncement();
    const raw = inputElement ? inputElement.value : "";
    if (!Hosts.isValidHostInput(raw)) {
      return;
    }
    const host = normHost(raw);
    const result = await View.addSite(host, Object.assign(siteEffects(), { disclose: presentDisclosure }));
    if (result.cancelled) return;
    if (result.ok && inputElement) inputElement.value = "";
    await refresh();
    if (inputElement && typeof inputElement.focus === "function") inputElement.focus();
    if (result.error) {
      showActionError(result.error);
    } else if (result.ok) {
      const origin = host.startsWith("http") ? host : `https://${host}`;
      const row = Status.siteRow(host, state, { activeSites: [] });
      if (row.kind === "on-now") {
        announce(`${host} added. what you share there now goes into your journal.`, "ok");
      } else {
        announce(`${host} added.`, "ok");
      }
    }
  }

  async function runSiteAction(action) {
    clearAnnouncement();
    if (action.id === "remove-site") {
      const origin = action.origin || (action.host && action.host.startsWith("http") ? action.host : `https://${action.host}`);
      const result = await cmd({ cmd: "removeGrantedOrigin", origin });
      await refresh();
      if (result.error) showActionError(result.error);
      return;
    }
    if (action.id === "allow-again" || action.id === "allow-site") {
      const result = await View.grantSite(action.host, siteEffects());
      await refresh();
      if (result.error) showActionError(result.error);
      return;
    }
    if (action.id === "dismiss-truncation") {
      await cmd({ cmd: "dismissTruncation", origin: action.origin || action.host, bound: action.bound });
      await refresh();
      return;
    }
  }

  function renderSiteRowsInto(containerId, allowlist) {
    const list = $(containerId);
    if (!list) return;
    list.replaceChildren();

    for (const entry of allowlist) {
      let host = entry;
      try {
        if (entry.startsWith("http")) host = new URL(entry).host;
      } catch (_e) {}

      const rowState = Status.siteRow(host, state, { activeSites: [] });
      const row = document.createElement("div");
      row.className = "site";
      const copyEl = document.createElement("div");
      copyEl.className = "site-copy";
      const hostEl = document.createElement("div");
      hostEl.className = "site-host";
      hostEl.textContent = host;
      const statusEl = document.createElement("div");
      statusEl.className = `site-state${rowState.kind === "on-now" ? " ok" : (rowState.kind === "paused-by-browser" || rowState.kind === "pressure-here") ? " bad" : ""}`;
      statusEl.textContent = rowState.label;
      copyEl.append(hostEl, statusEl);

      const actions = document.createElement("div");
      actions.className = "site-actions";
      if (rowState.action) {
        const actionBtn = document.createElement("button");
        actionBtn.type = "button";
        actionBtn.textContent = rowState.action.label;
        actionBtn.addEventListener("click", () => runSiteAction(Object.assign({ host, origin: entry }, rowState.action)));
        actions.append(actionBtn);
      }
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "remove";
      remove.addEventListener("click", () => runSiteAction({ id: "remove-site", host, origin: entry }));
      actions.append(remove);
      row.append(copyEl, actions);
      list.append(row);
    }
  }

  function getStep1State(st, derived) {
    if (!st || typeof st !== "object" || st.ok === false || !st.inst) {
      return {
        heading: "looking for the solstone app on this computer…",
        body: "",
        action: null,
        met: false,
      };
    }

    const platform = st.platform || "";

    // 1. Layer 1 Version Skew
    if (st.behind === "extension" || st.behind === "app") {
      const item = Status.derive(st, { anyGrantedTabOpen: false });
      return { heading: item.headline, body: item.reason, action: item.action, met: false };
    }

    // 2. Transport
    if (!st.connected) {
      return {
        heading: "can't reach the solstone app",
        body: Copy.STEP1_CANT_REACH_BODY,
        action: { id: "get-app", label: "get the solstone app" },
        met: false,
      };
    }

    // 3. Handshake connecting
    if (st.handshake === "pending") {
      const item = Status.derive(st, { anyGrantedTabOpen: false });
      return { heading: item.headline, body: item.reason, action: item.action, met: false };
    }

    // 4. Not paired
    if (st.hostCapture === "not_paired") {
      return {
        heading: "the solstone app isn't paired yet",
        body: Copy.STEP1_NOT_PAIRED_BODY,
        action: null,
        met: false,
      };
    }

    // 5. Intake off
    if (st.hostCapture === "intake_off") {
      if (st.hostFailure === "unaccepted_lost" || st.hostFailure === "queue_full" || st.hostFailure === "local_io" || st.hostFailure === "resource_exhausted" || st.hostFailure === "age_policy") {
        const item = Status.derive(st, { anyGrantedTabOpen: false });
        return { heading: item.headline, body: item.reason, action: item.action, met: false };
      }
      return {
        heading: "browser pages are off in the solstone app",
        body: platform === "linux" ? "" : Copy.STEP1_INTAKE_OFF_BODY,
        action: null,
        met: false,
      };
    }

    // 6. Layer 4 Custody limits & storage pressure
    if (st.custody?.full === true || st.pressure?.active === true) {
      const item = Status.derive(Object.assign({}, st, { consentVersion: 1, chosenOrigins: ["https://example.com"] }), { anyGrantedTabOpen: false });
      return { heading: item.headline, body: item.reason, action: item.action, met: false };
    }

    // 7. Paused app
    if (st.hostCapture === "paused") {
      return {
        heading: "found the solstone app, paired with your journal. it's paused right now.",
        body: "",
        action: null,
        met: true,
      };
    }

    // 8. Otherwise met
    return {
      heading: "found the solstone app, paired with your journal",
      body: "",
      action: null,
      met: true,
    };
  }

  function renderWelcome(derived) {
    if ($("pageSubTitle")) $("pageSubTitle").textContent = "in your browser";
    if ($("welcomeView")) $("welcomeView").hidden = false;
    if ($("settingsView")) $("settingsView").hidden = true;

    // Warm Card
    if (Copy && Copy.WARM_CARD) {
      if ($("warmKinship0")) $("warmKinship0").textContent = Copy.WARM_CARD[0];
      if ($("warmKinship1")) $("warmKinship1").textContent = Copy.WARM_CARD[1];
      if ($("warmKinship2")) $("warmKinship2").textContent = Copy.WARM_CARD[2];
    }

    // Step 1
    const step1 = getStep1State(state, derived);
    if ($("step1Heading")) $("step1Heading").textContent = step1.heading;
    if ($("step1Check")) $("step1Check").hidden = !step1.met;
    if ($("step1Body")) $("step1Body").textContent = step1.body;

    const actionBtn = $("step1ActionBtn");
    if (actionBtn) {
      if (step1.action) {
        actionBtn.hidden = false;
        actionBtn.textContent = step1.action.label;
      } else {
        actionBtn.hidden = true;
      }
    }

    // Step 2
    const consentGiven = state && state.consentVersion === 1;
    if ($("step2Heading")) $("step2Heading").textContent = "what the solstone extension takes in";
    if ($("step2DisclosureBody") && Copy) $("step2DisclosureBody").textContent = Copy.DISCLOSURE_BODY;
    if ($("step2ReReadBody") && Copy) $("step2ReReadBody").textContent = Copy.DISCLOSURE_BODY;

    if (consentGiven) {
      if ($("step2Check")) $("step2Check").hidden = false;
      if ($("step2Content")) $("step2Content").hidden = true;
      if ($("step2Completed")) $("step2Completed").hidden = false;
    } else {
      if ($("step2Check")) $("step2Check").hidden = true;
      if ($("step2Content")) $("step2Content").hidden = false;
      if ($("step2Completed")) $("step2Completed").hidden = true;
      if (!step1.met) {
        if ($("step2PendingText")) {
          $("step2PendingText").hidden = false;
          $("step2PendingText").textContent = "you'll agree to this once step 1 is done.";
        }
        if ($("agreeDisclosureBtn")) $("agreeDisclosureBtn").hidden = true;
      } else {
        if ($("step2PendingText")) $("step2PendingText").hidden = true;
        if ($("agreeDisclosureBtn")) {
          $("agreeDisclosureBtn").hidden = false;
          $("agreeDisclosureBtn").textContent = "agree and go on";
        }
      }
    }

    // Step 3
    if ($("step3Heading")) $("step3Heading").textContent = "choose your first site";
    const step3Open = consentGiven;
    if ($("step3Content")) $("step3Content").hidden = !step3Open;
    if ($("step3Check")) {
      const chosenList = Array.isArray(state && state.chosenOrigins) ? state.chosenOrigins : [];
      $("step3Check").hidden = !step3Open || chosenList.length === 0;
    }
    if ($("step3Body") && Copy) {
      $("step3Body").textContent = Copy.step3Body(state ? state.brand : "");
    }
    if ($("welcomeShowPageIndicator")) {
      $("welcomeShowPageIndicator").checked = !!(state && state.showPageIndicator);
    }

    const allowlist = Array.isArray(state && state.chosenOrigins)
      ? state.chosenOrigins
      : Array.isArray(state && state.grantedOrigins)
      ? state.grantedOrigins
      : [];
    renderSiteRowsInto("welcomeSiteList", allowlist);
  }

  function renderSettings(derived) {
    if ($("pageSubTitle")) $("pageSubTitle").textContent = "in your browser";
    if ($("welcomeView")) $("welcomeView").hidden = true;
    if ($("settingsView")) $("settingsView").hidden = false;

    // Status Section
    if ($("statusLead")) $("statusLead").textContent = derived.sub || derived.headline;
    if ($("statusStateChip")) {
      $("statusStateChip").textContent = derived.headline;
      $("statusStateChip").className = `state-chip ${derived.mark === "healthy" ? "ok" : derived.mark === "attention" ? "attention" : derived.mark === "error" ? "unavailable" : "calm"}`;
    }
    if ($("statusReason")) {
      $("statusReason").textContent = derived.reason || "";
      $("statusReason").hidden = !derived.reason;
    }

    // Sites Section
    const allowlist = Array.isArray(state && state.chosenOrigins)
      ? state.chosenOrigins
      : Array.isArray(state && state.grantedOrigins)
      ? state.grantedOrigins
      : [];
    renderSiteRowsInto("siteList", allowlist);

    // Indicator Section
    if ($("showPageIndicator")) $("showPageIndicator").checked = !!(state && state.showPageIndicator);

    // Disclosure Section
    if ($("settingsDisclosureBody") && Copy) $("settingsDisclosureBody").textContent = Copy.DISCLOSURE_BODY;
  }

  async function refresh() {
    state = await cmd({ cmd: "getState" });
    if ($("ver")) $("ver").textContent = state && state.version ? `v${state.version}` : "";

    const derived = Status.derive(state, { anyGrantedTabOpen: false });

    if ($("optionsMark")) {
      $("optionsMark").src = `brand/mark-${derived.mark || "healthy"}.svg`;
    }

    const chosen = Array.isArray(state && state.chosenOrigins)
      ? state.chosenOrigins
      : Array.isArray(state && state.grantedOrigins)
      ? state.grantedOrigins
      : [];

    const isWelcome = (!state || state.consentVersion !== 1) || chosen.length === 0;

    if (isWelcome) {
      renderWelcome(derived);
    } else {
      renderSettings(derived);
    }

    return { derived };
  }

  // Welcome Step 2 Agree Button
  if ($("agreeDisclosureBtn")) {
    $("agreeDisclosureBtn").addEventListener("click", async () => {
      clearAnnouncement();
      const result = await cmd({ cmd: "acknowledgeDisclosure", version: 1 });
      if (result.error) showActionError(result.error);
      await refresh();
    });
  }

  // Welcome Step 3 Marker Checkbox
  if ($("welcomeShowPageIndicator")) {
    $("welcomeShowPageIndicator").addEventListener("change", async () => {
      await cmd({ cmd: "setConfig", showPageIndicator: $("welcomeShowPageIndicator").checked });
      await refresh();
    });
  }

  // Settings Add Form
  if ($("addForm")) {
    $("addForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      await addSiteFromInput($("newHost"));
    });
  }

  // Settings Marker Checkbox
  if ($("showPageIndicator")) {
    $("showPageIndicator").addEventListener("change", async () => {
      await cmd({ cmd: "setConfig", showPageIndicator: $("showPageIndicator").checked });
      await refresh();
    });
  }

  // Site Disclosure confirmation
  if ($("siteDisclosureConfirm")) {
    $("siteDisclosureConfirm").addEventListener("click", () => closeDisclosure(true));
  }
  if ($("siteDisclosureCancel")) {
    $("siteDisclosureCancel").addEventListener("click", () => closeDisclosure(false));
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && $("siteDisclosure") && !$("siteDisclosure").hidden) closeDisclosure(false);
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

  globalThis.SolstoneOptions = { refresh };
  refresh();
})();
