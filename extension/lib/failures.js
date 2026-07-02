// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

(function () {
  "use strict";

  function classify(raw, status) {
    raw = raw == null ? "" : String(raw);
    const m = /HTTP\s+(\d{3})/.exec(raw);
    const code = typeof status === "number" ? status : m ? Number(m[1]) : null;

    if (code === 0 || /Failed to fetch|NetworkError|TypeError/i.test(raw)) {
      return "your journal didn't answer — is solstone running on this computer?";
    }
    if (code && code >= 400) {
      return `your journal said no (HTTP ${code}) — try again, or check settings`;
    }
    if (/Cannot access|chrome:\/\/|Web Store|match pattern/i.test(raw)) {
      return "chrome doesn't allow observing this page";
    }

    let short = raw.replace(/\s+/g, " ").trim();
    if (short.length > 80) short = short.slice(0, 80) + "…";
    return `something went wrong — ${short}`;
  }

  globalThis.SolstoneFailures = { classify };
})();
