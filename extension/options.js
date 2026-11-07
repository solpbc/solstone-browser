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
  const Actions = globalThis.SolstoneActions;
  const $ = (id) => document.getElementById(id);
  const cmd = (message) => new Promise((resolve) => chrome.runtime.sendMessage(message, (response) => resolve(response || {})));

  function renderDisclosure(element) {
    if (!element || !Copy) return;
    element.replaceChildren();
    let list = null;
    for (const line of Copy.DISCLOSURE_BODY.split("\n")) {
      if (!line) {
        list = null;
      } else if (line.startsWith("- ")) {
        if (!list) {
          list = document.createElement("ul");
          element.append(list);
        }
        const item = document.createElement("li");
        item.textContent = line.slice(2);
        list.append(item);
      } else {
        list = null;
        const paragraph = document.createElement("p");
        paragraph.textContent = line;
        element.append(paragraph);
      }
    }
  }

  const SITES_CARD_ACTIONS = new Set(["open-settings", "allow-all-sites", "retry-all-sites"]);
  let state = null;
  let disclosureResolve = null;
  let disclosureConfirm = null;
  let allSitesDisclosure = false;
  let disclosureReturnFocus = null;
  let accessCheck = null;
  let lastBroadReady = null;
  let step1Action = null;
  let paintSequence = 0;
  let appliedCaptureEpoch = -1;
  // The latest status from the background; state is what the page shows of
  // it, with the toolbar's timing for the app connection.
  let latest = null;
  let link = null;
  let linkTimer = null;

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
      getAllPermissions: () => chrome.permissions.getAll(),
      removePermission: (request) => chrome.permissions.remove(request),
    };
  }

  function focus(id) {
    const element = typeof id === "string" ? $(id) : id;
    if (element && !element.hidden && typeof element.focus === "function") element.focus();
  }

  function closeDisclosure(confirmed) {
    if (!disclosureResolve) return;
    // Runs inside the confirming click, before anything else, so the
    // browser's permission prompt opens from the owner's gesture.
    const confirm = disclosureConfirm;
    disclosureConfirm = null;
    const outcome = confirmed && confirm ? confirm() : confirmed;
    if ($("siteDisclosure")) $("siteDisclosure").hidden = true;
    if ($("sitesMain")) $("sitesMain").hidden = false;
    const resolve = disclosureResolve;
    disclosureResolve = null;
    focus(disclosureReturnFocus || "newHost");
    disclosureReturnFocus = null;
    resolve(outcome);
  }

  function presentDisclosure(host, confirm = null) {
    allSitesDisclosure = false;
    disclosureConfirm = typeof confirm === "function" ? confirm : null;
    const copy = Disclosure.addSite(host, state);
    if ($("siteDisclosureLeaveOut")) {
      $("siteDisclosureLeaveOut").textContent = copy.leaveOut || "";
      $("siteDisclosureLeaveOut").hidden = !copy.leaveOut;
    }
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
    focus("siteDisclosureConfirm");
    return new Promise((resolve) => {
      disclosureResolve = resolve;
    });
  }

  function chosenList() {
    if (state?.fence && Array.isArray(state.fence.entries)) return state.fence.entries;
    if (Array.isArray(state && state.chosenOrigins)) return state.chosenOrigins;
    if (Array.isArray(state && state.grantedOrigins)) return state.grantedOrigins;
    if (Array.isArray(state && state.livePatterns)) {
      const H = globalThis.SolstoneHosts;
      const res = [];
      for (const p of state.livePatterns) {
        if (H?.isBroadPattern?.(p)) continue;
        const row = H?.grantRowOrigin?.(p);
        if (row) res.push(row);
      }
      return res;
    }
    return [];
  }

  function fieldError(message) {
    const error = $("siteInputError");
    if (!error) return;
    error.textContent = message || "";
    error.hidden = !message;
  }

  async function addSiteFromInput(inputElement) {
    clearAnnouncement();
    fieldError("");
    const raw = inputElement ? inputElement.value : "";
    if (state?.siteMode === "all") {
      const host = Hosts.excludedHostname(raw.trim());
      if (!host) {
        if (raw.trim()) { fieldError(Copy.FIELD_ERROR); focus(inputElement); }
        return;
      }
      const result = await cmd({ cmd: "setLeftOut", host, out: true });
      if (result.error) showActionError(result.error);
      else { inputElement.value = ""; announce(Copy.leftOutAnnouncement(host), "ok"); }
      await refresh();
      return;
    }
    const origin = Hosts.chosenOrigin(raw);
    if (!origin) {
      if (raw.trim()) { fieldError(Copy.FIELD_ERROR); focus(inputElement); }
      return;
    }
    let rawHost = "";
    try { rawHost = new URL(origin).hostname; } catch (_e) {}
    const effectiveList = (state?.excludedHosts || []).concat(state?.appLeftOut || []);
    // Name the left-out entry that covers it (google.com for mail.google.com).
    const coveringEntry = rawHost ? effectiveList.find((s) => Hosts?.hostCovers ? Hosts.hostCovers(s, rawHost) : false) : null;
    if (coveringEntry) {
      announce(Copy.leftOutRefusal(coveringEntry), "bad");
      return;
    }
    const displayHost = Hosts.displayOrigin(origin);
    if (chosenList().includes(origin)) {
      if (inputElement) inputElement.value = "";
      announce(Copy.alreadyAdded(displayHost), "ok");
      focus(inputElement);
      return;
    }
    const result = await View.addSite(origin, Object.assign(siteEffects(), { disclose: presentDisclosure, skipSheet: Copy.MOBILE === true }));
    // Adding needs the solstone app answering and nothing paused; the status
    // card says which, and the owner is never left with a silent button.
    if (result.ineligible) {
      announce(Copy.ADD_NOT_NOW, "bad");
      focus(inputElement);
      return;
    }
    if (result.cancelled) return;
    if (result.ok && inputElement) inputElement.value = "";
    await refresh();
    if (inputElement && typeof inputElement.focus === "function") inputElement.focus();
    if (result.denied) {
      const blocked = result.blockedBy ? Copy.addBlockedBelow(state?.brand, rawHost, result.blockedBy) : "";
      announce(blocked || Copy.ADD_DENIED, "bad");
    } else if (result.error) {
      showActionError(result.error);
    } else if (result.ok) {
      const row = Status.siteRow(origin, state);
      announce(Copy.addedAnnouncement(displayHost, row.kind === "on-now"), "ok");
    }
  }

  async function runSiteAction(action) {
    clearAnnouncement();
    let failed = false;
    const effects = sharedActionEffects();
    const showError = effects.showError;
    effects.showError = (error) => { failed = true; showError(error); };
    await Actions.run(action, effects);
    if (failed) return;
    // Say what the click did; the row it came from is gone now.
    if (action.id === "remove-site") {
      announce(Copy.removedAnnouncement(action.label || action.host), "ok");
      focus("newHost");
    } else if (action.id === "include-site") {
      announce(Copy.includedAnnouncement(action.host), "ok");
      focus("newHost");
    }
  }

  function sharedActionEffects() {
    return {
      cmd, refresh,
      openSettings: () => chrome.runtime.openOptionsPage(),
      openApp: () => chrome.tabs.create({ url: "https://solstone.app" }),
      reload: () => chrome.runtime.reload(),
      grantSite: (origin) => View.grantSite(origin, siteEffects()),
      showError: showActionError,
      brand: state?.brand,
      requestPermission: (request) => chrome.permissions.request(request),
      showDenied: (action) => announce("permission declined. this site stays paused.", "bad"),
      lossSeq: () => state?.lossNotice?.seq,
    };
  }

  function renderSiteRowsInto(containerId, allowlist) {
    const list = $(containerId);
    if (!list) return;
    list.replaceChildren();
    if (state?.siteMode === "all" && allowlist.length === 0 && containerId === "siteList") {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "no sites left out.";
      list.append(empty);
    }

    for (const entry of allowlist) {
      // A chosen origin shows its port and an http:// scheme, so two entries
      // for one machine never look alike; a left-out entry is a bare host.
      const host = entry.startsWith("http") ? Hosts.displayOrigin(entry) : entry;
      let hostname = entry;
      try { if (entry.startsWith("http")) hostname = new URL(entry).hostname; } catch (_e) {}

      const excluded = state?.siteMode === "all";
      const rowState = excluded ? { kind: "excluded", label: "left out" } : Status.siteRow(entry, state);
      const row = document.createElement("div");
      row.className = "site";
      const copyEl = document.createElement("div");
      copyEl.className = "site-copy";
      const hostEl = document.createElement("div");
      hostEl.className = "site-host";
      hostEl.textContent = host;
      const statusEl = document.createElement("div");
      statusEl.className = `site-state${rowState.kind === "on-now" ? " ok" : rowState.kind === "paused-by-browser" ? " bad" : ""}`;
      statusEl.textContent = rowState.label;
      copyEl.append(hostEl, statusEl);

      const actions = document.createElement("div");
      actions.className = "site-actions";
      if (rowState.action) {
        const actionBtn = document.createElement("button");
        actionBtn.type = "button";
        actionBtn.textContent = rowState.action.label;
        actionBtn.addEventListener("click", () => runSiteAction(Object.assign({ host: hostname, origin: entry }, rowState.action)));
        actions.append(actionBtn);
      }
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = excluded ? "stop leaving out" : "remove";
      if (typeof remove.setAttribute === "function") remove.setAttribute("aria-label", `${remove.textContent} ${host}`);
      remove.addEventListener("click", () => runSiteAction({ id: excluded ? "include-site" : "remove-site", host: hostname, label: host, origin: entry }));
      actions.append(remove);
      row.append(copyEl, actions);
      list.append(row);
    }

    for (const [origin, notice] of Object.entries(state?.truncationByOrigin || {})) {
      if (!(notice?.count > 0)) continue;
      const attention = document.createElement("div");
      attention.className = "site-issue";
      const sentence = document.createElement("div");
      sentence.className = "w";
      sentence.textContent = Copy.TRUNCATION_ATTENTION;
      const dismiss = document.createElement("button");
      dismiss.type = "button";
      dismiss.textContent = "dismiss";
      dismiss.addEventListener("click", () => runSiteAction({ id: "dismiss-truncation", origin, bound: notice.newestId }));
      const site = document.createElement("div");
      site.className = "site-host";
      site.textContent = Hosts.displayOrigin(origin);
      attention.append(site, sentence, dismiss);
      list.append(attention);
    }
  }

  function getStep1State(st) {
    if (!st || typeof st !== "object" || st.ok === false || !st.inst) {
      return {
        heading: `looking for the solstone app on ${Copy.PLACE}\u2026`,
        body: "",
        action: null,
        met: false,
      };
    }
    const hold = Status.welcomeHold(st);
    return {
      heading: hold.heading,
      body: hold.body,
      action: hold.action,
      met: hold.met,
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
    const step1 = getStep1State(state);
    step1Action = step1.action;
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
          $("step2PendingText").textContent = Copy.STEP2_PENDING;
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

    const allowlist = chosenList();
    renderSiteRowsInto("welcomeSiteList", allowlist);
  }

  function renderSettings(derived) {
    if ($("pageSubTitle")) $("pageSubTitle").textContent = "in your browser";
    if ($("welcomeView")) $("welcomeView").hidden = true;
    if ($("settingsView")) $("settingsView").hidden = false;

    // Status Section
    // On a phone the card is only for what needs the owner; the list says the rest.
    if ($("statusCard")) $("statusCard").hidden = Copy.MOBILE === true && ["no-sites", "on", "idle"].includes(derived.kind);
    if ($("pauseSwitch")) $("pauseSwitch").checked = state?.paused === true;
    if ($("statusLead")) $("statusLead").textContent = derived.sub || derived.headline;
    if ($("statusStateChip")) {
      $("statusStateChip").textContent = derived.headline;
      $("statusStateChip").className = `state-chip ${derived.mark === "healthy" ? "ok" : derived.mark === "attention" ? "attention" : derived.mark === "error" ? "unavailable" : "calm"}`;
    }
    if ($("statusReason")) {
      $("statusReason").textContent = derived.reason || "";
      $("statusReason").hidden = !derived.reason;
    }
    const also = $("statusAlso");
    if (also) {
      also.replaceChildren();
      for (const item of derived.also || []) {
        const headline = document.createElement("div");
        headline.className = "status-also";
        headline.textContent = item.headline;
        if (item.action && !SITES_CARD_ACTIONS.has(item.action.id)) {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = item.action.label;
          button.addEventListener("click", () => Actions.run(item.action, sharedActionEffects()));
          headline.append(button);
        }
        also.append(headline);
      }
    }
    const actions = $("statusActions");
    if (actions) {
      actions.replaceChildren();
      // This page is settings, and its sites card carries the browser-access
      // actions, so the status card doesn't repeat them or point at itself.
      if (derived.action && !SITES_CARD_ACTIONS.has(derived.action.id)) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = derived.action.label;
        button.addEventListener("click", () => Actions.run(derived.action, sharedActionEffects()));
        actions.append(button);
      }
      // The popup's pause button reads resume; settings needs its own, or an
      // owner who comes here to turn things back on finds no way to.
      if (state?.paused) {
        const resume = document.createElement("button");
        resume.type = "button";
        resume.className = "primary";
        resume.textContent = "resume";
        resume.addEventListener("click", async () => {
          clearAnnouncement();
          const result = await cmd({ cmd: "setPaused", paused: false });
          if (result.error) showActionError(result.error);
          await refresh();
        });
        actions.append(resume);
      }
    }

    // Top sections (clearedNotice, upgradeQuestion, upgradeQuiet, stopResult)
    renderTopSections(optionsModel(state));

    // Sites Section
    renderSites();

    // Adoption Notices
    if (state?.adoptionNotices && state.adoptionNotices.length > 0) {
      announce(Copy.adoptedAnnouncement(state.brand, state.adoptionNotices), "ok");
      cmd({ cmd: "dismissAdoptionNotices" });
    }

    // Indicator Section
    if ($("showPageIndicator")) $("showPageIndicator").checked = !!(state && state.showPageIndicator);
    if ($("pauseWithApp")) $("pauseWithApp").checked = state?.pauseWithApp !== false;

  }

  let stopResultCode = null;

  function optionsModel(st) {
    st = st || {};
    const H = globalThis.SolstoneHosts;
    const isBroad = !st.fence && (st.broadGrant === true || (Array.isArray(st.livePatterns) && H?.broadLive(st.livePatterns)));
    const sections = [];

    if (st.clearedNotice) {
      sections.push({
        id: "clearedNotice",
        kind: "cleared-notice",
        text: Copy?.clearedStorageNotice ? Copy.clearedStorageNotice() : (Copy?.CLEARED_STORAGE_NOTICE || "safari cleared extension storage. solstone is paused."),
      });
    }

    if (st.fence && st.fence.sawMore && !st.fence.answered) {
      const leftOutHosts = Array.from(new Set([...(st.excludedHosts || []), ...(st.appLeftOut || [])]));
      const beyond = H?.beyondExample ? H.beyondExample(st.fence, st.livePatterns || [], leftOutHosts) : null;
      if (beyond) {
        const q = Copy?.fenceQuestion ? Copy.fenceQuestion(st.brand, beyond.kind, beyond.host) : null;
        if (q) {
          sections.push({
            id: "upgradeQuestion",
            kind: "upgrade-question",
            body: q.body,
            buttons: [
              {
                id: q.shareId,
                label: q.shareLabel,
                primary: true,
              },
              {
                id: q.keepId || "keep-my-sites",
                label: q.keepLabel || "keep my sites",
                primary: false,
              },
            ],
            action: {
              id: q.shareId,
              label: q.shareLabel,
              primary: true,
            },
            secondaryAction: {
              id: q.keepId || "keep-my-sites",
              label: q.keepLabel || "keep my sites",
              primary: false,
            },
          });
        }
      }
    } else if (st.fence && st.fence.answered) {
      sections.push({
        id: "upgradeQuiet",
        kind: "upgrade-quiet",
        text: Copy?.fenceQuiet ? Copy.fenceQuiet(st.brand) : (Copy?.FENCE_QUIET_LINE || "sharing the sites you chose."),
        action: {
          id: "share-every-site",
          label: Copy?.SHARE_EVERY_SITE || "share every site",
          primary: true,
        },
      });
    }

    if (stopResultCode) {
      const kind = stopResultCode === "still_every_site" ? "stop-still"
        : stopResultCode === "every_site_off_none" ? "stop-none"
        : stopResultCode === "every_site_off_some" ? "stop-some" : null;
      if (kind) {
        sections.push({
          id: "stopResult",
          kind,
          text: Copy?.stopResultCopy ? Copy.stopResultCopy(st.brand, stopResultCode) : "",
        });
      }
    }

    if (isBroad) {
      sections.push({
        id: "access",
        kind: "access",
        brand: st.brand,
        safari: st.brand === "safari",
        steps: st.brand === "safari",
        stopSharing: st.brand !== "safari",
      });
    }

    return sections;
  }

  function renderTopSections(modelSections) {
    let topContainer = $("optionsTopSections");
    if (!topContainer) {
      topContainer = document.createElement("div");
      topContainer.id = "optionsTopSections";
      const settingsView = $("settingsView");
      if (settingsView && settingsView.firstChild) {
        settingsView.insertBefore(topContainer, settingsView.firstChild);
      } else if (settingsView) {
        settingsView.appendChild(topContainer);
      }
    }
    topContainer.replaceChildren();
    for (const sec of modelSections) {
      if (["cleared-notice", "upgrade-question", "upgrade-quiet", "stop-still", "stop-none", "stop-some"].includes(sec.kind)) {
        const div = document.createElement("section");
        div.className = `card ${sec.kind}`;
        div.dataset.kind = sec.kind;
        if (sec.kind === "cleared-notice") {
          const p = document.createElement("p");
          p.textContent = sec.text;
          div.append(p);
        } else if (sec.kind === "upgrade-question") {
          const h2 = document.createElement("h2");
          h2.textContent = sec.title;
          const p = document.createElement("p");
          p.textContent = sec.body;
          const actions = document.createElement("div");
          actions.className = "actions";
          for (const btn of (sec.buttons || [])) {
            const b = document.createElement("button");
            b.type = "button";
            b.className = btn.primary ? "primary" : "";
            b.textContent = btn.label;
            b.addEventListener("click", async () => {
              if (btn.id === "share-every-site") {
                const requested = requestShareEverySite();
                if (requested && typeof requested.then === "function") await requested;
                await cmd({ cmd: "shareEverySite" });
              } else if (btn.id === "share-them-too") await cmd({ cmd: "shareThemToo" });
              else if (btn.id === "keep-my-sites") await cmd({ cmd: "keepMySites" });
              await refresh();
            });
            actions.append(b);
          }
          div.append(h2, p, actions);
        } else if (sec.kind === "upgrade-quiet") {
          const p = document.createElement("p");
          p.textContent = sec.text;
          const actions = document.createElement("div");
          actions.className = "actions";
          const b = document.createElement("button");
          b.type = "button";
          b.className = "primary";
          b.textContent = sec.action.label;
          b.addEventListener("click", async () => {
            const requested = requestShareEverySite();
            if (requested && typeof requested.then === "function") await requested;
            await cmd({ cmd: "shareEverySite" });
            await refresh();
          });
          actions.append(b);
          div.append(p, actions);
        } else if (["stop-still", "stop-none", "stop-some"].includes(sec.kind)) {
          const p = document.createElement("p");
          p.textContent = sec.text;
          div.append(p);
        }
        topContainer.append(div);
      }
    }
  }

  // The request starts before this handler awaits, while the click still counts.
  function requestShareEverySite() {
    if (state?.brand === "safari") return null;
    try {
      return chrome.permissions.request({ origins: ["*://*/*"] });
    } catch (_e) {
      return null;
    }
  }

  function offersShareEverySite() {
    if (!state?.fence || state.fence.sawMore === true) return false;
    return Hosts?.everySiteLive?.(state.livePatterns || []) !== true;
  }

  function renderAccess(isBroad) {
    const panel = $("accessPanel");
    if (!panel) return;
    const offerShare = offersShareEverySite();
    if (state?.fence && !offerShare) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    const words = Copy.accessCopy(state?.brand);
    const safari = state?.brand === "safari";

    if (isBroad) {
      if ($("accessGranted")) $("accessGranted").hidden = true;
      if ($("accessMissing")) $("accessMissing").hidden = false;
      if ($("accessTitle")) $("accessTitle").textContent = "";
      if (safari) {
        if ($("accessBody")) $("accessBody").textContent = `${Copy.safariStopLine()}${words.grantedNote ? " " + words.grantedNote : ""}`;
        if ($("accessSteps")) {
          $("accessSteps").replaceChildren();
          $("accessSteps").hidden = true;
        }
        if ($("accessReturn")) $("accessReturn").hidden = true;
        if ($("accessCheck")) $("accessCheck").hidden = true;
        if ($("accessChecking")) $("accessChecking").textContent = "";
        if ($("accessAllow")) $("accessAllow").hidden = true;
      } else {
        if ($("accessBody")) $("accessBody").textContent = "";
        if ($("accessSteps")) {
          $("accessSteps").replaceChildren();
          $("accessSteps").hidden = true;
        }
        if ($("accessReturn")) $("accessReturn").hidden = true;
        if ($("accessCheck")) $("accessCheck").hidden = true;
        if ($("accessChecking")) $("accessChecking").textContent = "";
        if ($("accessAllow")) {
          $("accessAllow").hidden = false;
          $("accessAllow").textContent = "stop sharing every site";
        }
      }
    } else {
      if ($("accessGranted")) $("accessGranted").hidden = true;
      if ($("accessMissing")) $("accessMissing").hidden = false;
      if (safari && !offerShare) {
        if ($("accessTitle")) $("accessTitle").textContent = words.missingTitle;
        if ($("accessBody")) $("accessBody").textContent = words.missingBody;
        const steps = $("accessSteps");
        if (steps) {
          steps.replaceChildren();
          for (const step of words.steps) {
            const item = document.createElement("li");
            item.textContent = step;
            steps.append(item);
          }
          steps.hidden = words.steps.length === 0;
        }
        if ($("accessReturn")) {
          $("accessReturn").textContent = words.returnNote;
          $("accessReturn").hidden = !words.returnNote;
        }
        if ($("accessAllow")) $("accessAllow").hidden = true;
        if ($("accessCheck")) {
          $("accessCheck").hidden = false;
          $("accessCheck").textContent = words.checkLabel;
        }
        if ($("accessChecking")) $("accessChecking").textContent = accessCheck ? words.checking : "";
      } else {
        if ($("accessTitle")) $("accessTitle").textContent = words.missingTitle;
        if ($("accessBody")) $("accessBody").textContent = words.missingBody;
        if ($("accessSteps")) {
          $("accessSteps").replaceChildren();
          $("accessSteps").hidden = true;
        }
        if ($("accessReturn")) $("accessReturn").hidden = true;
        if ($("accessCheck")) $("accessCheck").hidden = true;
        if ($("accessChecking")) $("accessChecking").textContent = "";
        if ($("accessAllow")) {
          $("accessAllow").hidden = false;
          $("accessAllow").textContent = "share every site";
        }
      }
    }

    const denied = (state?.browserDeniedOrigins || []);
    if ($("accessDenied")) $("accessDenied").hidden = denied.length === 0;
    if ($("accessDeniedTitle")) $("accessDeniedTitle").textContent = words.deniedTitle;
    const list = $("accessDeniedList");
    if (list) {
      list.replaceChildren();
      for (const origin of denied) {
        const item = document.createElement("li");
        try { item.textContent = new URL(origin).hostname; } catch (_e) { item.textContent = origin; }
        list.append(item);
      }
    }
    if ($("accessDeniedHelp")) {
      $("accessDeniedHelp").textContent = words.deniedHelp;
      $("accessDeniedHelp").hidden = !words.deniedHelp;
    }
  }

  function renderSites() {
    const H = globalThis.SolstoneHosts;
    const everySite = !state?.fence && H?.everySiteLive?.(state?.livePatterns) === true;

    if ($("modeSelected")) $("modeSelected").hidden = true;
    if ($("modeAll")) $("modeAll").hidden = true;
    if ($("offersBlock")) $("offersBlock").hidden = true;
    if ($("broadInSelectedNote")) $("broadInSelectedNote").hidden = true;
    if ($("regrant")) $("regrant").hidden = true;
    if ($("exactOnly")) $("exactOnly").hidden = true;
    if ($("keptNote")) $("keptNote").hidden = true;

    renderAccess(everySite);

    if ($("listHeading")) $("listHeading").textContent = "your sites";
    if ($("siteModeHelp")) {
      $("siteModeHelp").textContent = Copy.addHelp(state?.brand);
      $("siteModeHelp").hidden = false;
    }
    if ($("siteInputLabel")) $("siteInputLabel").textContent = "add a site";
    if ($("addBtn")) $("addBtn").textContent = "add this site";

    let visibleSites = [];
    if (state?.fence) {
      visibleSites = state.fence.entries || [];
    } else if (everySite) {
      visibleSites = [];
    } else if (Array.isArray(state?.livePatterns)) {
      const origins = new Set();
      for (const pattern of state.livePatterns) {
        if (!H.isBroadPattern(pattern)) {
          const row = H.grantRowOrigin?.(pattern);
          if (row) origins.add(row);
        }
      }
      visibleSites = Array.from(origins);
    } else {
      visibleSites = [];
    }

    renderSiteRowsInto("siteList", visibleSites);

    const leftOutDetails = $("leftOutDetails");
    if (leftOutDetails) {
      const localEx = state?.excludedHosts || [];
      const appEx = state?.appLeftOut || [];
      const effectiveList = Array.from(new Set([...localEx, ...appEx]));
      if (effectiveList.length === 0) {
        leftOutDetails.hidden = true;
      } else {
        leftOutDetails.hidden = false;
        if ($("leftOutSummary")) {
          $("leftOutSummary").textContent = Copy.leftOutSummary(effectiveList.length);
        }
        const listDiv = $("leftOutList");
        if (listDiv) {
          listDiv.replaceChildren();
          for (const host of effectiveList) {
            const isLocal = localEx.includes(host);
            const row = document.createElement("div");
            row.className = "site";
            const hostSpan = document.createElement("span");
            hostSpan.className = "site-host";
            hostSpan.textContent = host;
            row.append(hostSpan);

            if (isLocal || state?.leftOutCapable) {
              const btn = document.createElement("button");
              btn.type = "button";
              btn.textContent = "stop leaving out";
              btn.addEventListener("click", async () => {
                clearAnnouncement();
                const res = await cmd({ cmd: "setLeftOut", host, out: false });
                if (res?.error) showActionError(res.error);
                else announce(Copy.includedAnnouncement(host), "ok");
                await refresh();
              });
              row.append(btn);
            } else {
              const span = document.createElement("span");
              span.className = "muted";
              span.textContent = Copy.appOnlyLeftOut;
              row.append(span);
            }
            listDiv.append(row);
          }
        }
      }
    }
  }

  function paint(nextState, sequence) {
    if (sequence !== paintSequence) return;
    latest = nextState;
    return show();
  }

  function show() {
    link = Status.present(link, latest, undefined, Date.now());
    if (linkTimer != null) clearTimeout(linkTimer);
    linkTimer = link.wakeAt == null ? null : setTimeout(() => {
      linkTimer = null;
      show();
    }, Math.max(0, link.wakeAt - Date.now()));
    // Nothing heard yet: the page keeps its first look.
    if (!link.status) return;
    state = link.status;
    if ($("ver")) $("ver").textContent = state && state.version ? `v${state.version}` : "";

    const derived = Status.derive(state);

    if ($("optionsMark")) {
      $("optionsMark").src = `brand/mark-${Copy.MOBILE === true ? "healthy" : derived.mark || "healthy"}.svg`;
    }

    const chosen = Array.isArray(state && state.chosenOrigins)
      ? state.chosenOrigins
      : Array.isArray(state && state.grantedOrigins)
      ? state.grantedOrigins
      : [];

    const isWelcome = !state || state.consentVersion !== 1;

    if (isWelcome) {
      renderWelcome(derived);
    } else {
      renderSettings(derived);
    }

    return { derived };
  }

  function applyStatus(nextState) {
    const epoch = Number.isSafeInteger(nextState?.captureEpoch) ? nextState.captureEpoch : appliedCaptureEpoch;
    if (epoch < appliedCaptureEpoch) return;
    appliedCaptureEpoch = Math.max(appliedCaptureEpoch, epoch);
    const sequence = ++paintSequence;
    paint(nextState, sequence);
  }

  async function refresh() {
    const sequence = ++paintSequence;
    const nextState = await cmd({ cmd: "getState" });
    if (sequence !== paintSequence) return;
    const epoch = Number.isSafeInteger(nextState?.captureEpoch) ? nextState.captureEpoch : appliedCaptureEpoch;
    if (epoch < appliedCaptureEpoch) return;
    appliedCaptureEpoch = Math.max(appliedCaptureEpoch, epoch);
    return paint(nextState, sequence);
  }

  for (const id of ["step2DisclosureBody", "step2ReReadBody", "settingsDisclosureBody"]) {
    renderDisclosure($(id));
  }

  // Welcome Step 2 Agree Button
  if ($("agreeDisclosureBtn")) {
    $("agreeDisclosureBtn").addEventListener("click", async () => {
      clearAnnouncement();
      const result = await cmd({ cmd: "acknowledgeDisclosure", version: 1 });
      if (result.error) {
        // The welcome view stays up, so the failure shows where the button was.
        if ($("step2PendingText")) {
          $("step2PendingText").hidden = false;
          $("step2PendingText").textContent = Failures.classify(result.error, state);
        }
        return;
      }
      await refresh();
      // Settings replaces the welcome page now; put the owner at the first site.
      focus("newHost");
    });
  }

  if ($("step1ActionBtn")) {
    $("step1ActionBtn").addEventListener("click", () => {
      if (step1Action) Actions.run(step1Action, sharedActionEffects());
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

  // Settings Pause With App Checkbox
  // On iPhone and iPad the solstone app has no pause, so there is nothing to choose.
  if (Copy.MOBILE && $("pauseWithAppCard")) $("pauseWithAppCard").hidden = true;
  // A phone's settings are one list: its sites, two switches, and what it takes in.
  if (Copy.MOBILE) {
    document.documentElement.classList.add("mobile");
    document.querySelector("#disclosureCard summary").textContent = "what it takes in";
    document.querySelector("#indicatorCard label").lastChild.textContent = " show an icon on pages you share";
    $("newHost").placeholder = "eff.org";
    $("pauseCard").hidden = false;
    $("pauseSwitch").addEventListener("change", async () => {
      await cmd({ cmd: "setPaused", paused: $("pauseSwitch").checked });
      await refresh();
    });
  }
  if ($("pauseWithApp")) {
    $("pauseWithApp").addEventListener("change", async () => {
      await cmd({ cmd: "setConfig", pauseWithApp: $("pauseWithApp").checked });
      await refresh();
    });
  }

  // Site Disclosure confirmation
  if ($("siteDisclosureConfirm")) {
    $("siteDisclosureConfirm").addEventListener("click", () => {
      closeDisclosure(true);
    });
  }
  if ($("siteDisclosureCancel")) {
    $("siteDisclosureCancel").addEventListener("click", () => closeDisclosure(false));
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && $("siteDisclosure") && !$("siteDisclosure").hidden) closeDisclosure(false);
  });

  $("modeAllBtn")?.addEventListener("click", async () => {});
  $("modeSelectedBtn")?.addEventListener("click", async () => {});
  $("accessAllow")?.addEventListener("click", async () => {
    clearAnnouncement();
    const H = globalThis.SolstoneHosts;
    const isBroad = !state?.fence && (state?.broadGrant === true || (Array.isArray(state?.livePatterns) && H?.broadLive(state.livePatterns)));
    const everySite = !state?.fence && H?.everySiteLive?.(state?.livePatterns) === true;
    if (isBroad && everySite) {
      const result = await cmd({ cmd: "stopSharingEverySite" });
      if (result?.result) {
        stopResultCode = result.result;
        announce(Copy?.stopResultCopy(state?.brand, result.result), "ok");
      }
    } else {
      const requested = requestShareEverySite();
      if (requested && typeof requested.then === "function") await requested;
      await cmd({ cmd: "shareEverySite" });
    }
    await refresh();
  });

  // Safari's grant is made in its own settings window, so this page re-reads the
  // browser whenever the owner comes back to it, and on request.
  async function checkAccess(explicit) {
    if (accessCheck) return;
    // A check that doesn't answer gives up, so check again always works; the
    // status channel still brings the answer whenever the browser gives it.
    accessCheck = Promise.race([cmd({ cmd: "checkEverySite" }),
      new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), 10000))]);
    renderSites();
    const result = await accessCheck;
    accessCheck = null;
    await refresh();
    if (result?.timedOut) renderSites();
    else if (result?.error) showActionError(result.error);
    else if (explicit && state?.broadGrant !== true) {
      announce(Copy.accessCopy(state?.brand).stillMissing, "bad");
    }
  }
  $("accessCheck")?.addEventListener("click", () => checkAccess(true));
  // Safari can unload and restart the background without closing this page's
  // status channel, so coming back reconnects before trusting what is shown.
  function onReturn() {
    subscribeStatus();
    checkAccess(false);
  }
  window.addEventListener("focus", onReturn);
  if (typeof document.addEventListener === "function") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") onReturn();
    });
  }
  if ($("exactOnlyBtn")) $("exactOnlyBtn").addEventListener("click", async () => {
    $("exactOnlyBtn").hidden = true;
  });
  if ($("regrantBtn")) $("regrantBtn").addEventListener("click", async () => {
    $("regrantBtn").hidden = true;
  });

  let subscriptionEpoch = 0;
  let reconnectTimer = null;
  let statusPort = null;
  let lastStatusAt = Date.now();
  let subscribedAt = 0;
  function subscribeStatus() {
    const generation = ++subscriptionEpoch;
    appliedCaptureEpoch = -1;
    lastStatusAt = Date.now();
    subscribedAt = lastStatusAt;
    try { statusPort?.disconnect?.(); } catch (_e) {}
    statusPort = null;
    // The channel closes when the background restarts. What the page knew is
    // void, but it holds what it shows briefly while the new background
    // answers, and resubscribes at once (a channel that fails again right away
    // waits a second).
    const disconnected = () => {
      if (generation !== subscriptionEpoch) return;
      subscriptionEpoch++;
      appliedCaptureEpoch = -1;
      if (reconnectTimer == null) reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        subscribeStatus();
      }, Date.now() - subscribedAt >= 1000 ? 0 : 1000);
      link = Status.resume(link, Date.now());
      paint(Status.withdrawn(latest, true), ++paintSequence);
      refresh();
    };
    try {
      const port = chrome.runtime.connect({ name: "status" });
      statusPort = port;
      port.onMessage.addListener(msg => {
        if (generation === subscriptionEpoch && msg?.type === "status" && msg.status) {
          lastStatusAt = Date.now();
          applyStatus(msg.status);
        }
      });
      port.onDisconnect.addListener(disconnected);
    } catch (_e) { disconnected(); }
  }
  subscribeStatus();

  // The background pushes status every few seconds while the app is connected.
  // A visible page that hears nothing for a while resubscribes rather than keep
  // showing a state from a background that is gone.
  function watchStatus() {
    if (typeof document.visibilityState !== "string") return;
    setTimeout(() => {
      if (document.visibilityState === "visible" && Date.now() - lastStatusAt > 12000) {
        subscribeStatus();
        refresh();
      }
      watchStatus();
    }, 5000);
  }
  watchStatus();

  globalThis.SolstoneOptions = { refresh, optionsModel, model: optionsModel };
  refresh();
})();
