// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
//
// cws.mjs — keyless Chrome Web Store API V2 release operations.
//
// Local use impersonates the publisher-linked service account with gcloud.
// CI passes a short-lived GitHub OIDC/WIF access token in CWS_ACCESS_TOKEN.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyReleaseArtifacts } from "./verify-package.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PUBLISHER_ID = process.env.CWS_PUBLISHER_ID || "3c2cbd26-afd5-4962-b486-dcc01a7c6c28";
const ITEM_ID = process.env.CWS_ITEM_ID || "eibbeeoifjoabddfmgeggnageolkcnim";
const SERVICE_ACCOUNT =
  process.env.CWS_SERVICE_ACCOUNT || "chrome-web-store-publisher@extro-mail.iam.gserviceaccount.com";
const SCOPE = "https://www.googleapis.com/auth/chromewebstore";
const ITEM_NAME = `publishers/${PUBLISHER_ID}/items/${ITEM_ID}`;
const API_ITEM = `https://chromewebstore.googleapis.com/v2/${ITEM_NAME}`;
const UPLOAD_URL = `https://chromewebstore.googleapis.com/upload/v2/${ITEM_NAME}:upload`;
const DEFAULT_POLL_INTERVAL_MS = 180_000;
const DEFAULT_MAX_POLLS = 10;

function fail(message) {
  throw new Error(message);
}

export function revisionVersions(revision) {
  return (revision?.distributionChannels || [])
    .map((channel) => channel.crxVersion)
    .filter((version) => typeof version === "string" && version.length > 0);
}

export function summarizeStatus(status) {
  const summarizeRevision = (revision) =>
    revision
      ? {
          state: revision.state || "ITEM_STATE_UNSPECIFIED",
          versions: revisionVersions(revision),
          distributionChannels: revision.distributionChannels || [],
        }
      : null;

  return {
    itemId: status.itemId || ITEM_ID,
    published: summarizeRevision(status.publishedItemRevisionStatus),
    submitted: summarizeRevision(status.submittedItemRevisionStatus),
    lastAsyncUploadState: status.lastAsyncUploadState || null,
    takenDown: Boolean(status.takenDown),
    warned: Boolean(status.warned),
  };
}

export function assertVersionIsNew(status, version) {
  const published = revisionVersions(status.publishedItemRevisionStatus);
  const submitted = revisionVersions(status.submittedItemRevisionStatus);
  const locations = [];
  if (published.includes(version)) locations.push("published revision");
  if (submitted.includes(version)) locations.push("submitted revision");
  assert.equal(
    locations.length,
    0,
    `version ${version} already exists in the Store ${locations.join(" and ")}; refusing to upload or submit it again`,
  );
}

export function assertNoActiveSubmission(status) {
  const state = status.submittedItemRevisionStatus?.state;
  assert.ok(
    !["PENDING_REVIEW", "STAGED"].includes(state),
    `Store already has an active ${state} submission; publish or cancel it before uploading another package`,
  );
}

export function assertConfirmedVersion(actualVersion, confirmedVersion) {
  assert.equal(
    confirmedVersion,
    actualVersion,
    `mutating Store operations require --confirm-version ${actualVersion}`,
  );
}

export function assertReleaseTag(tags, version) {
  assert.ok(
    tags.includes(`v${version}`),
    `HEAD must carry immutable release tag v${version} before its package can be uploaded`,
  );
}

function parseArgs(argv) {
  const [command = "help", ...args] = argv;
  let packagePath = null;
  let confirmVersion = null;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--confirm-version") {
      confirmVersion = args[index + 1];
      index += 1;
    } else if (argument.startsWith("--confirm-version=")) {
      confirmVersion = argument.slice("--confirm-version=".length);
    } else if (argument.startsWith("-")) {
      fail(`unknown option: ${argument}`);
    } else if (packagePath === null) {
      packagePath = resolve(argument);
    } else {
      fail(`unexpected argument: ${argument}`);
    }
  }

  return { command, packagePath, confirmVersion };
}

function accessToken() {
  if (process.env.CWS_ACCESS_TOKEN) return process.env.CWS_ACCESS_TOKEN;
  try {
    return execFileSync(
      "gcloud",
      [
        "auth",
        "print-access-token",
        `--impersonate-service-account=${SERVICE_ACCOUNT}`,
        `--scopes=${SCOPE}`,
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "inherit"],
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      },
    ).trim();
  } catch (error) {
    fail(`could not mint a short-lived Store token with gcloud: ${error.message}`);
  }
}

async function apiRequest(url, { method = "GET", json, body, contentType } = {}) {
  const headers = { Authorization: `Bearer ${accessToken()}` };
  if (json !== undefined) headers["Content-Type"] = "application/json";
  if (contentType) headers["Content-Type"] = contentType;

  const response = await fetch(url, {
    method,
    headers,
    body: json === undefined ? body : JSON.stringify(json),
    signal: AbortSignal.timeout(300_000),
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    const detail = typeof payload === "string" ? payload : JSON.stringify(payload);
    fail(`Chrome Web Store API ${method} ${response.status}: ${detail}`);
  }
  return payload;
}

async function fetchStatus() {
  return apiRequest(`${API_ITEM}:fetchStatus`);
}

function printStatus(status, label = "Chrome Web Store status") {
  console.log(`${label}:`);
  console.log(JSON.stringify(summarizeStatus(status), null, 2));
}

function releasePackage(packagePath) {
  const sourceVersion = JSON.parse(readFileSync(join(ROOT, "extension", "manifest.json"), "utf8")).version;
  const expectedPath = join(ROOT, "dist", `solstone-browser-${sourceVersion}-cws.zip`);
  return verifyReleaseArtifacts({
    root: ROOT,
    version: sourceVersion,
    cwsZipPath: packagePath || expectedPath,
  });
}

function assertImmutableRelease(version) {
  let status;
  let tags;
  try {
    status = execFileSync("git", ["status", "--porcelain"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
    }).trim();
    tags = execFileSync("git", ["tag", "--points-at", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
    })
      .trim()
      .split("\n")
      .filter(Boolean);
  } catch (error) {
    fail(`could not verify the immutable release commit: ${error.message}`);
  }
  assert.equal(status, "", "release tree must be clean before its Store package can be uploaded");
  assertReleaseTag(tags, version);
}

function uploadStateKind(state) {
  if (["SUCCEEDED", "UPLOAD_SUCCEEDED"].includes(state)) return "succeeded";
  if (["IN_PROGRESS", "UPLOAD_IN_PROGRESS"].includes(state)) return "in-progress";
  if (["FAILED", "UPLOAD_FAILED"].includes(state)) return "failed";
  return "unknown";
}

async function waitForUpload(initialUpload) {
  const initialKind = uploadStateKind(initialUpload.uploadState);
  if (initialKind === "succeeded") return;
  if (initialKind === "failed") fail(`Store rejected upload ${initialUpload.crxVersion || ""}`.trim());
  if (initialKind === "unknown") fail(`Store returned unknown upload state: ${initialUpload.uploadState}`);

  const intervalMs = Number(process.env.CWS_POLL_INTERVAL_MS || DEFAULT_POLL_INTERVAL_MS);
  const maxPolls = Number(process.env.CWS_MAX_POLLS || DEFAULT_MAX_POLLS);
  assert.ok(Number.isFinite(intervalMs) && intervalMs >= 0, "CWS_POLL_INTERVAL_MS must be nonnegative");
  assert.ok(Number.isInteger(maxPolls) && maxPolls > 0, "CWS_MAX_POLLS must be a positive integer");

  console.log(`upload is asynchronous; waiting ${intervalMs / 1000}s between status checks`);
  for (let poll = 1; poll <= maxPolls; poll += 1) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, intervalMs));
    const status = await fetchStatus();
    printStatus(status, `upload status ${poll}/${maxPolls}`);
    const kind = uploadStateKind(status.lastAsyncUploadState);
    if (kind === "succeeded") return;
    if (kind === "failed") fail("Store reported that the asynchronous upload failed");
  }
  fail(`upload did not finish after ${maxPolls} status checks`);
}

async function uploadPackage(result) {
  const before = await fetchStatus();
  printStatus(before, "pre-upload Store status");
  assertVersionIsNew(before, result.version);
  assertNoActiveSubmission(before);

  const upload = await apiRequest(UPLOAD_URL, {
    method: "POST",
    body: readFileSync(result.cwsZipPath),
    contentType: "application/zip",
  });
  console.log("upload response:");
  console.log(JSON.stringify(upload, null, 2));
  assert.equal(
    upload.crxVersion || result.version,
    result.version,
    `Store upload response version differs from package ${result.version}`,
  );
  await waitForUpload(upload);
  return upload;
}

async function stageRelease(result) {
  await uploadPackage(result);
  const submission = await apiRequest(`${API_ITEM}:publish`, {
    method: "POST",
    json: {
      publishType: "STAGED_PUBLISH",
      skipReview: false,
      blockOnWarnings: true,
    },
  });
  console.log("submission response:");
  console.log(JSON.stringify(submission, null, 2));
  assert.ok(
    ["PENDING_REVIEW", "STAGED"].includes(submission.state),
    `unexpected submission state ${submission.state}; inspect the dashboard before proceeding`,
  );
  console.log(
    submission.state === "PENDING_REVIEW"
      ? `version ${result.version} was accepted for review; it is not approved or published`
      : `version ${result.version} is approved and staged; it is not published`,
  );
}

function assertSubmittedVersion(status, expectedState, version) {
  const submitted = status.submittedItemRevisionStatus;
  assert.equal(submitted?.state, expectedState, `expected submitted state ${expectedState}, got ${submitted?.state || "none"}`);
  assert.ok(
    revisionVersions(submitted).includes(version),
    `submitted ${expectedState} revision does not contain confirmed version ${version}`,
  );
  assert.ok(
    !revisionVersions(status.publishedItemRevisionStatus).includes(version),
    `version ${version} is already published; refusing to publish it again`,
  );
}

async function publishStaged(version) {
  const before = await fetchStatus();
  printStatus(before, "pre-publication Store status");
  assertSubmittedVersion(before, "STAGED", version);
  const published = await apiRequest(`${API_ITEM}:publish`, {
    method: "POST",
    json: {
      publishType: "DEFAULT_PUBLISH",
      skipReview: false,
      blockOnWarnings: true,
    },
  });
  console.log("publication response:");
  console.log(JSON.stringify(published, null, 2));
  assert.equal(published.state, "PUBLISHED", `Store did not report PUBLISHED; got ${published.state}`);
}

async function cancelSubmission(version) {
  const before = await fetchStatus();
  printStatus(before, "pre-cancellation Store status");
  assertSubmittedVersion(before, "PENDING_REVIEW", version);
  await apiRequest(`${API_ITEM}:cancelSubmission`, { method: "POST" });
  console.log(`cancelled the pending review for version ${version}`);
}

function usage() {
  console.log(`Usage:
  node scripts/cws.mjs status
  node scripts/cws.mjs upload [dist/...-cws.zip] --confirm-version VERSION
  node scripts/cws.mjs stage [dist/...-cws.zip] --confirm-version VERSION
  node scripts/cws.mjs publish-staged --confirm-version VERSION
  node scripts/cws.mjs cancel --confirm-version VERSION

status is read-only. Every mutating command requires the exact version as an
explicit confirmation. "stage" uploads and submits for review using
STAGED_PUBLISH, so approval never makes the release live without a separate
founder-approved publish-staged command.`);
}

async function main(argv) {
  const { command, packagePath, confirmVersion } = parseArgs(argv);
  if (command === "help" || command === "--help" || command === "-h") {
    usage();
    return;
  }
  if (command === "status") {
    assert.equal(packagePath, null, "status does not accept a package path");
    printStatus(await fetchStatus());
    return;
  }
  if (command === "upload" || command === "stage") {
    const result = releasePackage(packagePath);
    assertConfirmedVersion(result.version, confirmVersion);
    assertImmutableRelease(result.version);
    if (command === "upload") await uploadPackage(result);
    else await stageRelease(result);
    return;
  }
  if (command === "publish-staged") {
    assert.ok(confirmVersion, "publish-staged requires --confirm-version VERSION");
    await publishStaged(confirmVersion);
    return;
  }
  if (command === "cancel") {
    assert.ok(confirmVersion, "cancel requires --confirm-version VERSION");
    await cancelSubmission(confirmVersion);
    return;
  }
  fail(`unknown command: ${command}`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`cws: ${error.message}`);
    process.exit(1);
  });
}
