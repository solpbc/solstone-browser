// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

// The owner-facing disclosure copy, in one place, derived live from config so
// it can never claim a destination other than where the pages actually go.
//
// This copy is bound to `clo/compliance/privacy-policy.md` § "from the browser
// extension" and must not claim MORE than it. The Chrome Web Store checks the
// privacy policy, the dashboard declaration, and the extension's actual
// behavior against each other, so an in-product disclosure that over-claims is
// a review finding. Two corrections CLO caught before submission, both of which
// the code itself falsifies -- keep them true:
//
//   * "rendered text", never "visible text" and never "no hidden text".
//     skim.js gates on checkVisibility({checkOpacity, checkVisibilityCSS}) with
//     no viewport and no clip test, so below-the-fold and sr-only text IS taken
//     in, and blocks.js readAttrs() reads aria-label/title, which skim.js can
//     promote to a boundary block's entire text.
//   * sol pbc can never READ it, which is not the same as never receiving it.
//     On the operated tier the sealed bytes cross a relay sol pbc runs, which
//     handles routing, authentication, enrollment and delivery framing. The
//     absolutes that hold on every tier are the analytics/telemetry/phone-home/
//     counts set.
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
    return {
      label: "nowhere yet",
      detail: "set up your journal first. until then, browser updates wait here.",
    };
  }

  function addSite(host, status) {
    return {
      title: `add ${host}?`,
      whatSolTakesIn: "the solstone app takes in what you share with it on this site whenever a tab is open. all of it goes into your journal: rendered text and rough layout, including background tabs and text you'd only see by scrolling. never pixels.",
      unsentText: "rendered text can include words you've typed but haven't sent.",
      destination: destinationFor(status),
      whatChromeDoes: "Chrome will ask you to allow this next. you can remove the site any time.",
      confirmLabel: "add this site",
      cancelLabel: "cancel",
    };
  }

  function firstRun(status) {
    return {
      kinship: [
        "welcome to solstone.",
        "the solstone app takes in what you share with it, and all of it goes into your journal.",
        "your journal is always private, only yours.",
      ],
      scope: "you choose which browser sites to share with the solstone app.",
      whatSolTakesIn: "on a site you add, the solstone app takes in what you share with it. all of it goes into your journal: the page's rendered text and rough layout, what you can see now and what you'd see by scrolling, plus some labels pages provide to screen readers and tooltips that sometimes aren't drawn on screen. never pixels. never raw HTML. never a site you didn't add.",
      unsentText: "rendered text can include words you've typed but haven't sent.",
      neverReceives: "browser updates can wait in this browser while your journal is unavailable. before their content crosses the relay, it is sealed for your journal. the browser sends the relay the sealed content, not the key needed to open it.",
      absolutes: "no analytics. no telemetry. no phone home. nobody counted.",
      destination: destinationFor(status),
      nothingYet: "nothing is taken in until you add your first site.",
    };
  }

  globalThis.SolstoneDisclosure = { addSite, firstRun };
})();
