// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

(function () {
  "use strict";

  function shareResult(result) {
    if (result?.result === "share_held" || result?.result === "question_every_site") return result.result;
    return result?.error || "storage_error";
  }

  async function run(action, effects) {
    if (!action || !effects) return false;
    const cmd = effects.cmd;
    const refresh = effects.refresh;
    if (action.id === "get-app") {
      effects.openApp();
      return true;
    }
    if (action.id === "open-settings" || action.id === "finish-setup") {
      effects.openSettings();
      return true;
    }
    if (action.id === "update-now") {
      const fresh = await cmd({ cmd: "getState" });
      if (fresh?.updateCheck === "update-available") effects.reload();
      else await refresh();
      return true;
    }
    if (action.id === "dismiss-loss") {
      await cmd({ cmd: "dismissLoss", seq: action.seq || effects.lossSeq?.() });
      await refresh();
      return true;
    }
    if (action.id === "dismiss-truncation") {
      const result = await cmd({ cmd: "dismissTruncation", origin: action.origin, bound: action.bound });
      if (result?.ok === false) effects.showError(result.error || "storage_error");
      else await refresh();
      return true;
    }
    if (action.id === "retry-all-sites") {
      const result = await cmd({ cmd: "retryAllSites" });
      if (result?.error || result?.ok === false) effects.showError(result?.error || "storage_error");
      await refresh();
      return true;
    }
    if (action.id === "share-every-site") {
      if (effects.brand !== "safari" && typeof effects.requestPermission === "function") {
        try { await effects.requestPermission({ origins: ["*://*/*"] }); } catch (_e) {}
      }
      const result = await cmd({ cmd: "shareEverySite" });
      if (result?.error || result?.ok === false) effects.showError(shareResult(result));
      await refresh();
      return true;
    }
    if (action.id === "share-them-too") {
      const result = await cmd({ cmd: "shareThemToo" });
      if (result?.error || result?.ok === false) effects.showError(shareResult(result));
      await refresh();
      return true;
    }
    if (action.id === "keep-my-sites") {
      const result = await cmd({ cmd: "keepMySites" });
      if (result?.error || result?.ok === false) effects.showError(result?.error || "storage_error");
      await refresh();
      return true;
    }
    if (action.id === "remove-site") {
      const result = await cmd({ cmd: "removeGrantedOrigin", origin: action.origin });
      if (result?.error || result?.saved === false || result?.ok === false) effects.showError(result?.error || "storage_error");
      await refresh();
      return true;
    }
    if (action.id === "exclude-site" || action.id === "include-site" || action.id === "leave-out") {
      const result = await cmd({ cmd: "setLeftOut", host: action.host || action.origin, out: action.id !== "include-site" });
      if (result?.error || result?.ok === false) effects.showError(result.error || "storage_error");
      await refresh();
      return true;
    }
    return false;
  }

  globalThis.SolstoneActions = { run };
})();
