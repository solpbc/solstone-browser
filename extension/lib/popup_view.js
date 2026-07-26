// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

(function () {
  "use strict";

  const ATTENTION_KINDS = new Set(["error", "paused-browser"]);

  function siteCountLine(rows) {
    rows = Array.isArray(rows) ? rows : [];
    if (rows.length === 0) return "";
    const noun = rows.length === 1 ? "site" : "sites";
    if (rows.every((row) => row.kind === "on")) return `${rows.length} ${noun}, all on`;
    if (rows.every((row) => row.kind === "paused")) return `${rows.length} ${noun}, all paused`;
    const on = rows.filter((row) => row.kind === "on").length;
    if (on > 0) return `${rows.length} ${noun}, ${on} on`;
    return `${rows.length} ${noun}`;
  }

  function visibleRow(entry, row) {
    if (row.kind === "error") {
      return {
        host: entry,
        kind: row.kind,
        label: globalThis.SolstoneFailures.classify(row.label),
        action: { id: "remove-site", label: "remove this site", host: entry },
      };
    }
    return {
      host: entry,
      kind: row.kind,
      label: row.label,
      action: { id: "allow-site", label: "allow again", host: entry },
    };
  }

  function arrange(verdict, state, page) {
    state = state || {};
    page = page || {};
    const allowlist = Array.isArray(state.allowlist) ? state.allowlist : [];
    const siteRows = allowlist.map((entry) => {
      const row = globalThis.SolstoneStatus.siteRowState(entry, Object.assign({}, state, {
        matchHost: globalThis.SolstoneHosts.matchHostFor(entry),
        pageHost: page.host || "",
      }));
      return { entry, kind: row.kind, label: row.label };
    });
    const attentionRows = siteRows
      .filter((row) => ATTENTION_KINDS.has(row.kind))
      .map((row) => visibleRow(row.entry, row));
    const pageRow = siteRows.find((row) => row.entry === page.host);
    let pageState;
    let siteAction;

    if (!page.ok) {
      pageState = "sol can't take in this page";
      siteAction = { id: "add-site", label: "add this site", disabled: true, primary: true };
    } else if (!pageRow) {
      pageState = "not added";
      siteAction = { id: "add-site", label: "add this site", disabled: false, primary: true };
    } else {
      pageState = pageRow.kind === "error"
        ? globalThis.SolstoneFailures.classify(pageRow.label)
        : pageRow.label;
      siteAction = { id: "remove-site", label: "remove this site", disabled: false, primary: false };
    }

    const sections = [{
      id: "verdict",
      tone: verdict.tone,
      headline: verdict.headline,
      sub: verdict.sub,
      reason: verdict.reason,
      action: verdict.actions[0] || null,
    }];
    if (attentionRows.length > 0) sections.push({ id: "siteIssues", rows: attentionRows });
    sections.push({
      id: "page",
      host: page.host || "this page",
      state: pageState,
      siteAction,
      // No sites means nothing to pause, and a fresh install's one job is
      // adding the first one. Offering a control that acts on an empty set is
      // scaffolding on the surface that can least afford it.
      pauseAction: siteRows.length === 0 && !state.paused ? null : {
        id: "set-paused",
        label: state.paused ? "resume" : "pause all",
        primary: !!state.paused,
      },
    });
    if (siteRows.length > 0) sections.push({ id: "siteCount", text: siteCountLine(siteRows) });
    sections.push({ id: "footer" });
    return sections;
  }

  async function grantSite(host, effects) {
    const intent = await effects.cmd({ cmd: "siteIntent", host });
    if (!intent.ok) return { ok: false, error: "could not save the site" };
    let granted = false;
    try {
      granted = await effects.requestPermission({
        origins: [globalThis.SolstoneHosts.matchPatternFor(host)],
      });
    } catch (_error) {
      granted = false;
    }
    if (!granted) {
      if (intent.added) await effects.cmd({ cmd: "removeSite", host });
      return { ok: false, denied: true, added: intent.added };
    }
    return effects.cmd({ cmd: "siteGranted", host });
  }

  async function addSite(host, effects) {
    const confirmed = await effects.disclose(host);
    if (!confirmed) return { ok: false, cancelled: true };
    return grantSite(host, effects);
  }

  globalThis.SolstonePopupView = { arrange, siteCountLine, grantSite, addSite };
})();
