// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

(function () {
  "use strict";

  function applyList({ epoch, rev, savedEpoch, savedRev, savedList = [], localExcluded = [], frameList = [], acceptHost } = {}) {
    const validFrame = (frameList || []).filter((h) => (typeof acceptHost === "function" ? acceptHost(h) : true));
    const saved = [...new Set(savedList || [])];
    const local = [...new Set(localExcluded || [])];

    // Case 1: No saved epoch
    if (savedEpoch == null) {
      return {
        list: [...new Set(validFrame)].sort(),
        epoch: epoch || null,
        rev: typeof rev === "number" ? rev : 0,
        localExcluded: local.sort(),
        migrated: [],
        haveSavedList: true,
      };
    }

    const sameEpoch = epoch != null && epoch === savedEpoch;
    const currentRev = typeof rev === "number" ? rev : 0;
    const priorRev = typeof savedRev === "number" ? savedRev : 0;

    // Case 2: Same epoch, equal rev -> union of names, localExcluded unchanged
    if (sameEpoch && currentRev === priorRev) {
      const union = [...new Set([...saved, ...validFrame])].sort();
      return {
        list: union,
        epoch: savedEpoch,
        rev: priorRev,
        localExcluded: local.sort(),
        migrated: [],
        haveSavedList: true,
      };
    }

    // Case 3: Same epoch, higher rev -> list becomes frameList.
    // Saved names missing from frame are removed from localExcluded.
    if (sameEpoch && currentRev > priorRev) {
      const frameSet = new Set(validFrame);
      const missingFromFrame = new Set(saved.filter((h) => !frameSet.has(h)));
      const nextLocal = local.filter((h) => !missingFromFrame.has(h)).sort();
      return {
        list: [...new Set(validFrame)].sort(),
        epoch,
        rev: currentRev,
        localExcluded: nextLocal,
        migrated: [],
        haveSavedList: true,
      };
    }

    // Case 4: Same epoch, lower rev OR different epoch
    // Names in saved list missing from frame are added to localExcluded (migrated).
    const frameSet = new Set(validFrame);
    const missing = saved.filter((h) => !frameSet.has(h));
    const nextLocal = [...new Set([...local, ...missing])].sort();
    return {
      list: [...new Set(validFrame)].sort(),
      epoch: epoch || null,
      rev: currentRev,
      localExcluded: nextLocal,
      migrated: [...new Set(missing)].sort(),
      haveSavedList: true,
    };
  }

  function noteAck({ outstandingId, ackId } = {}) {
    if (typeof outstandingId === "number" && typeof ackId === "number" && ackId === outstandingId) {
      return "settled";
    }
    return "pending";
  }

  function ruleResult({ outstanding, frameList = [] } = {}) {
    if (!outstanding) return "applied";
    const hosts = new Set(frameList || []);
    const present = hosts.has(outstanding.host);
    if (outstanding.out === true && !present) return "refused";
    if (outstanding.out === false && present) return "refused";
    return "applied";
  }

  function nextMigration({ queue = [], refused = new Set(), outstanding = null, now = 0, lastSentAt = null, blocked = false } = {}) {
    if (blocked || outstanding != null) return null;
    if (lastSentAt != null && now - lastSentAt < 1000) return null;
    const ref = refused instanceof Set ? refused : new Set(refused || []);
    for (const host of queue) {
      if (!ref.has(host)) return host;
    }
    return null;
  }

  function migrationBlocked(outstanding, now = 0) {
    if (outstanding && typeof outstanding.sentAt === "number") {
      return now - outstanding.sentAt >= 10000;
    }
    return false;
  }

  globalThis.SolstoneLeftOut = {
    applyList,
    noteAck,
    ruleResult,
    nextMigration,
    migrationBlocked,
  };
})();
