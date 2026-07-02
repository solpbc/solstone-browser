// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
//
// journal.js — the HTTP client for the local solstone journal's observer API.
// One observer registration, one stream, segment uploads. Mirrors the contract
// the Python observers use (observe/remote_client.py): self-register against
// /app/observer/register, then multipart-upload segments to
// /app/observer/ingest with the minted key as a bearer token.
//
// Runs in the MV3 service worker via importScripts -> `globalThis.SolstoneJournal`.

(function () {
  "use strict";

  const OBSERVER_HEADER = "X-Solstone-Observer";
  const PROTOCOL_HEADER = "X-Solstone-Protocol-Version";

  // POST /app/observer/register. Returns {key, name, prefix, protocol_version}.
  // The journal locks the stream identity (hostname + ".browser") onto the
  // record and mints the key. Must be called from the same machine as the
  // journal (it enforces direct-localhost) — i.e. the extension runs where the
  // journal runs.
  async function register(journalUrl, descriptor) {
    const url = journalUrl.replace(/\/+$/, "") + "/app/observer/register";
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(descriptor),
    });
    if (!resp.ok) {
      let detail = "";
      try {
        detail = JSON.stringify(await resp.json());
      } catch (_e) {
        /* ignore */
      }
      const err = new Error(`register failed: HTTP ${resp.status} ${detail}`);
      err.status = resp.status;
      throw err;
    }
    return resp.json();
  }

  // POST /app/observer/ingest. `files` = [{name, text}]. Returns
  // {ok, duplicate, status, body}.
  async function uploadSegment(journalUrl, key, { day, segment, meta, files }) {
    const url = journalUrl.replace(/\/+$/, "") + "/app/observer/ingest";
    const form = new FormData();
    form.append("day", day);
    form.append("segment", segment);
    if (meta) form.append("meta", JSON.stringify(meta));
    for (const f of files) {
      form.append("files", new Blob([f.text], { type: "application/octet-stream" }), f.name);
    }
    const resp = await fetch(url, {
      method: "POST",
      headers: { [OBSERVER_HEADER]: key, Authorization: `Bearer ${key}` },
      body: form,
    });
    let body = null;
    try {
      body = await resp.json();
    } catch (_e) {
      /* non-JSON */
    }
    return {
      ok: resp.ok,
      status: resp.status,
      duplicate: !!(body && body.status === "duplicate"),
      failed: !!(body && body.status === "failed"),
      body,
    };
  }

  // POST /app/observer/ingest/event — fire-and-forget diagnostics beacon
  // (e.g. observe.status). Bumps the journal's last-seen so the observer
  // dashboard reads "connected" between segment uploads. Carries no observed
  // user data — only the observer's own health.
  async function relayEvent(journalUrl, key, tract, event, fields) {
    const url = journalUrl.replace(/\/+$/, "") + "/app/observer/ingest/event";
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { [OBSERVER_HEADER]: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({ tract, event }, fields)),
      });
      return resp.ok;
    } catch (_e) {
      return false;
    }
  }

  // GET /app/observer/ingest/segments/{day}. Returns array or null.
  async function getSegments(journalUrl, key, day) {
    const url = journalUrl.replace(/\/+$/, "") + `/app/observer/ingest/segments/${day}`;
    const resp = await fetch(url, {
      headers: { [OBSERVER_HEADER]: key, Authorization: `Bearer ${key}` },
    });
    if (!resp.ok) return null;
    return resp.json();
  }

  async function checkConnection(journalUrl, key, day) {
    const url = journalUrl.replace(/\/+$/, "") + `/app/observer/ingest/segments/${day}`;
    try {
      const resp = await fetch(url, { headers: { [OBSERVER_HEADER]: key, Authorization: `Bearer ${key}` } });
      let error = null;
      if (!resp.ok) {
        let d = "";
        try {
          d = JSON.stringify(await resp.json());
        } catch (_e) {}
        error = `HTTP ${resp.status}${d ? " " + d : ""}`;
      }
      return { ok: resp.ok, status: resp.status, error };
    } catch (e) {
      return { ok: false, status: 0, error: String((e && e.message) || e) };
    }
  }

  globalThis.SolstoneJournal = { register, uploadSegment, relayEvent, getSegments, checkConnection, OBSERVER_HEADER, PROTOCOL_HEADER };
})();
