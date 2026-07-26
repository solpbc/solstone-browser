// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

(function () {
  "use strict";

  function destinationFor(status) {
    status = status || {};
    const remote = status.remote || {};
    if (remote.paired) {
      return {
        label: "your journal at your home",
        detail: remote.relayOrigin
          ? `sealed in this browser. ${remote.relayOrigin} carries bytes it can't open.`
          : "sealed in this browser.",
      };
    }
    if (!remote.pending && status.journalUrl) {
      return {
        label: "your journal on this computer",
        detail: status.journalUrl,
      };
    }
    return {
      label: "nowhere yet",
      detail: "set up your journal first, or what sol takes in will just pile up here.",
    };
  }

  function addSite(host, status) {
    return {
      title: `add ${host}?`,
      whatSolTakesIn: "sol will take in the visible text of this site, along with you, whenever a tab on it is open, and keep it in your journal. that includes background tabs.",
      destination: destinationFor(status),
      whatChromeDoes: "chrome will ask you to allow this next. you can remove the site any time.",
      confirmLabel: "add this site",
      cancelLabel: "cancel",
    };
  }

  function firstRun(status) {
    return {
      kinship: [
        "this is sol, part of solstone.",
        "sol lives on your devices, experiences your day with you, and keeps it all in your journal.",
        "your journal is always private, only yours.",
      ],
      scope: "in your browser, sol takes in only the sites you add.",
      whatSolTakesIn: "on a site you add, sol takes in the visible text and rough layout of the page, along with you, and keeps it in your journal. never pixels. never hidden text. never a site you didn't add.",
      neverReceives: "sol pbc never receives any of it.",
      destination: destinationFor(status),
      nothingYet: "nothing is taken in until you add your first site.",
    };
  }

  globalThis.SolstoneDisclosure = { addSite, firstRun };
})();
