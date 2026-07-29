// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import assert from "node:assert/strict";
import test from "node:test";
import {
  assertConfirmedVersion,
  assertNoActiveSubmission,
  assertReleaseTag,
  assertVersionIsNew,
  revisionVersions,
  summarizeStatus,
} from "../scripts/cws.mjs";

const status = {
  itemId: "eibbeeoifjoabddfmgeggnageolkcnim",
  publishedItemRevisionStatus: {
    state: "PUBLISHED",
    distributionChannels: [{ crxVersion: "0.1.0", deployPercentage: 100 }],
  },
  submittedItemRevisionStatus: {
    state: "PENDING_REVIEW",
    distributionChannels: [{ crxVersion: "0.1.1", deployPercentage: 0 }],
  },
  lastAsyncUploadState: "SUCCEEDED",
};

test("revisionVersions extracts only concrete Store versions", () => {
  assert.deepStrictEqual(
    revisionVersions({ distributionChannels: [{ crxVersion: "0.1.1" }, {}, { crxVersion: "" }] }),
    ["0.1.1"],
  );
  assert.deepStrictEqual(revisionVersions(undefined), []);
});

test("summarizeStatus does not expose the Store public key", () => {
  const summary = summarizeStatus({ ...status, publicKey: "do-not-print" });
  assert.equal(Object.hasOwn(summary, "publicKey"), false);
  assert.equal(summary.published.state, "PUBLISHED");
  assert.deepStrictEqual(summary.submitted.versions, ["0.1.1"]);
});

test("duplicate published or submitted versions are refused", () => {
  assert.throws(() => assertVersionIsNew(status, "0.1.0"), /already exists.*published revision/);
  assert.throws(() => assertVersionIsNew(status, "0.1.1"), /already exists.*submitted revision/);
  assert.doesNotThrow(() => assertVersionIsNew(status, "0.1.2"));
});

test("a pending or staged revision blocks another upload", () => {
  assert.throws(() => assertNoActiveSubmission(status), /active PENDING_REVIEW submission/);
  assert.throws(
    () =>
      assertNoActiveSubmission({
        submittedItemRevisionStatus: { state: "STAGED" },
      }),
    /active STAGED submission/,
  );
  assert.doesNotThrow(() => assertNoActiveSubmission({}));
});

test("mutations require the exact package version confirmation", () => {
  assert.doesNotThrow(() => assertConfirmedVersion("0.1.2", "0.1.2"));
  assert.throws(() => assertConfirmedVersion("0.1.2", "0.1.1"), /--confirm-version 0.1.2/);
  assert.throws(() => assertConfirmedVersion("0.1.2", null), /--confirm-version 0.1.2/);
});

test("only the matching immutable release tag satisfies the upload guard", () => {
  assert.doesNotThrow(() => assertReleaseTag(["v0.1.2"], "0.1.2"));
  assert.throws(() => assertReleaseTag(["v0.1.1", "preview"], "0.1.2"), /immutable release tag v0.1.2/);
});
