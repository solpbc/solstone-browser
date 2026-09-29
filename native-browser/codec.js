// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

(function () {
  "use strict";

  function getConsts() {
    const c = globalThis.SolstoneNativeBrowserConstants;
    if (!c) {
      throw new Error("missing SolstoneNativeBrowserConstants");
    }
    return c;
  }

  function requireConst(c, name) {
    if (c[name] === undefined) {
      throw new Error("missing constant: " + name);
    }
    return c[name];
  }

  // --- Canonical JSON Encoder ---

  function isLoneSurrogate(str) {
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) {
        if (i + 1 < str.length) {
          const next = str.charCodeAt(i + 1);
          if (next >= 0xdc00 && next <= 0xdfff) {
            i++;
            continue;
          }
        }
        return true;
      }
      if (code >= 0xdc00 && code <= 0xdfff) {
        return true;
      }
    }
    return false;
  }

  function escapeString(str) {
    if (isLoneSurrogate(str)) {
      const err = new Error("lone surrogate in string");
      err.code = "lone_surrogate";
      throw err;
    }
    let out = '"';
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      const code = str.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
        const next = str.charCodeAt(i + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          out += ch + str[i + 1];
          i++;
          continue;
        }
      }
      if (ch === '"') {
        out += '\\"';
      } else if (ch === "\\") {
        out += "\\\\";
      } else if (code < 0x20) {
        out += "\\u00" + code.toString(16).padStart(2, "0");
      } else {
        out += ch;
      }
    }
    out += '"';
    return out;
  }

  function canonicalStringify(val, keyOrderMap) {
    if (val === null) return "null";
    if (typeof val === "boolean") return val ? "true" : "false";
    if (typeof val === "number") {
      if (!Number.isFinite(val)) throw new Error("bad number");
      return String(val);
    }
    if (typeof val === "string") {
      return escapeString(val);
    }
    if (Array.isArray(val)) {
      return "[" + val.map((item) => canonicalStringify(item, keyOrderMap)).join(",") + "]";
    }
    if (typeof val === "object") {
      const type = val.type || (val.t === "segment_start" ? "snapshot_record" : val.t === "delta" ? "delta_record" : null);
      let knownKeys = [];
      if (keyOrderMap && type && keyOrderMap[type]) {
        knownKeys = keyOrderMap[type];
      } else if (keyOrderMap && val.t && keyOrderMap[val.t === "segment_start" ? "snapshot_record" : "delta_record"]) {
        knownKeys = keyOrderMap[val.t === "segment_start" ? "snapshot_record" : "delta_record"];
      } else if (keyOrderMap && (val.id !== undefined || val.text !== undefined) && keyOrderMap.block) {
        knownKeys = keyOrderMap.block;
      } else if (keyOrderMap && (val.label !== undefined || val.level !== undefined || val.linkHost !== undefined) && keyOrderMap.block_attrs) {
        knownKeys = keyOrderMap.block_attrs;
      }

      const allKeys = Object.keys(val);
      const presentKnown = knownKeys.filter((k) => Object.prototype.hasOwnProperty.call(val, k) && val[k] !== undefined);
      const unknownKeys = allKeys.filter((k) => !knownKeys.includes(k) && val[k] !== undefined);
      unknownKeys.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

      const ordered = presentKnown.concat(unknownKeys);
      const pairs = ordered.map((k) => escapeString(k) + ":" + canonicalStringify(val[k], keyOrderMap));
      return "{" + pairs.join(",") + "}";
    }
    throw new Error("unsupported type");
  }

  function encode(msg) {
    const consts = getConsts();
    const keyOrder = requireConst(consts, "CANONICAL_KEY_ORDER");
    const jsonStr = canonicalStringify(msg, keyOrder);
    return new TextEncoder().encode(jsonStr);
  }

  // --- Lexeme Scanner & Rewriter ---

  function scanLoneSurrogateEscapes(text) {
    const re = /\\u([0-9a-fA-F]{4})/g;
    let match;
    while ((match = re.exec(text)) !== null) {
      const code = parseInt(match[1], 16);
      if (code >= 0xd800 && code <= 0xdbff) {
        const nextIdx = match.index + 6;
        const nextSub = text.slice(nextIdx, nextIdx + 6);
        const nextMatch = /^\\u([0-9a-fA-F]{4})/.exec(nextSub);
        if (nextMatch) {
          const nextCode = parseInt(nextMatch[1], 16);
          if (nextCode >= 0xdc00 && nextCode <= 0xdfff) {
            re.lastIndex = nextIdx + 6;
            continue;
          }
        }
        return true;
      }
      if (code >= 0xdc00 && code <= 0xdfff) {
        return true;
      }
    }
    return false;
  }

  function parseIntegerLexeme(lexeme, timestampMax) {
    if (typeof lexeme !== "string") return null;
    const s = lexeme.trim();
    if (s.startsWith("-")) return { err: "bad_number" };
    if (s.startsWith("+") || /^0\d/.test(s) || /\.$/.test(s)) return { err: "bad_json" };
    if (/e/i.test(s)) {
      const parts = s.split(/[eE]/);
      if (parts.length !== 2) return { err: "bad_json" };
      const mantissaStr = parts[0];
      const expStr = parts[1];
      const exp = Number(expStr);
      if (!Number.isInteger(exp)) return { err: "bad_json" };
      const mNum = Number(mantissaStr);
      if (Number.isNaN(mNum) || mNum < 0) return { err: "bad_number" };
      const val = mNum * Math.pow(10, exp);
      if (!Number.isInteger(val) || val < 0 || val > timestampMax) {
        return { err: "bad_number" };
      }
      return { val: Math.floor(val) };
    }
    if (s.includes(".")) {
      const parts = s.split(".");
      if (parts.length !== 2) return { err: "bad_json" };
      if (!/^\d+$/.test(parts[0]) || !/^\d+$/.test(parts[1])) return { err: "bad_json" };
      if (parts[1].replace(/0+$/, "").length > 0) {
        return { err: "bad_number" };
      }
      const val = Number(parts[0]);
      if (val < 0 || val > timestampMax) return { err: "bad_number" };
      return { val };
    }
    if (!/^\d+$/.test(s)) return { err: "bad_json" };
    const val = Number(s);
    if (val < 0 || val > timestampMax) return { err: "bad_number" };
    return { val };
  }

  function rewriteIntegerLexemes(text, timestampMax) {
    return text.replace(/"(protocol|queued_at_ms|freshness_ms|ts|n|depth)"\s*:\s*([^,}\]\s]+)/g, (match, key, rawVal) => {
      if (rawVal.startsWith('"') || rawVal === "null" || rawVal === "true" || rawVal === "false" || rawVal.startsWith("{") || rawVal.startsWith("[")) {
        return match;
      }
      const res = parseIntegerLexeme(rawVal, timestampMax);
      if (res.err) {
        const err = new Error("number parsing error");
        err.code = res.err;
        throw err;
      }
      return `"${key}":${res.val}`;
    });
  }

  // --- Decoder ---

  function decode(input, direction) {
    const consts = getConsts();
    const timestampMax = requireConst(consts, "TIMESTAMP_MAX");
    const brandEnum = requireConst(consts, "BRAND_ENUM");
    const instMax = requireConst(consts, "INST_STRING_MAX");
    const versionMax = requireConst(consts, "VERSION_MAX");
    const extCap = requireConst(consts, "EXTENSION_TO_HOST_MAX");
    const controlMax = requireConst(consts, "CONTROL_MAX");
    const captureEnum = requireConst(consts, "CAPTURE_ENUM");
    const deliveryEnum = requireConst(consts, "DELIVERY_ENUM");
    const failureEnum = requireConst(consts, "FAILURE_ENUM");
    const byeReasonEnum = requireConst(consts, "BYE_REASON_ENUM");
    const behindEnum = requireConst(consts, "BEHIND_ENUM");
    const idMax = requireConst(consts, "ID_STRING_MAX");
    const deltaRecordsMax = requireConst(consts, "DELTA_RECORDS_MAX");
    const directions = requireConst(consts, "DIRECTIONS");

    let text;
    let byteLength;
    if (typeof input === "string") {
      text = input;
      byteLength = new TextEncoder().encode(input).byteLength;
    } else if (input instanceof Uint8Array || (typeof Buffer !== "undefined" && Buffer.isBuffer(input))) {
      byteLength = input.byteLength;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(input);
      } catch (_e) {
        const err = new Error("invalid utf-8");
        err.code = "bad_utf8";
        return { status: "refuse", error: err, code: "bad_utf8" };
      }
    } else {
      const err = new Error("empty payload");
      err.code = "empty_payload";
      return { status: "refuse", error: err, code: "empty_payload" };
    }

    if (byteLength === 0 || text.trim() === "") {
      const err = new Error("empty payload");
      err.code = "empty_payload";
      return { status: "refuse", error: err, code: "empty_payload" };
    }

    // Step 1: scan for lone surrogates
    if (scanLoneSurrogateEscapes(text) || isLoneSurrogate(text)) {
      const err = new Error("lone surrogate");
      err.code = "lone_surrogate";
      return { status: "refuse", error: err, code: "lone_surrogate" };
    }

    // Step 2: integer-lexeme scanner & rewriter
    let parsedText = text;
    try {
      parsedText = rewriteIntegerLexemes(text, timestampMax);
    } catch (e) {
      return { status: "refuse", error: e, code: e.code || "bad_number" };
    }

    // Step 3: parse JSON
    let obj;
    try {
      obj = JSON.parse(parsedText);
    } catch (_e) {
      const err = new Error("bad json");
      err.code = "bad_json";
      return { status: "refuse", error: err, code: "bad_json" };
    }

    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      const err = new Error("bad json");
      err.code = "bad_json";
      return { status: "refuse", error: err, code: "bad_json" };
    }

    // Step 4: type check
    if (!("type" in obj)) {
      const err = new Error("missing type field");
      err.code = "missing_field";
      return { status: "refuse", error: err, code: "missing_field" };
    }
    const type = obj.type;
    const knownTypes = ["hello", "hello_ack", "unsupported", "state", "batch", "boundary", "accepted", "bye"];
    if (!knownTypes.includes(type)) {
      const err = new Error("bad type");
      err.code = "bad_type";
      return { status: "refuse", error: err, code: "bad_type" };
    }

    // Step 5: hello loose shape & unsupported check
    if (type === "hello") {
      const isProtocolIntegral = typeof obj.protocol === "number" && Number.isInteger(obj.protocol);
      const hasBrand = Object.prototype.hasOwnProperty.call(obj, "brand");
      const isBrandEnum = brandEnum.includes(obj.brand);
      const isInstValid = typeof obj.inst === "string" && obj.inst.length <= instMax;
      const isVersionValid = typeof obj.version === "string" && obj.version.length <= versionMax;
      if (!isProtocolIntegral || !hasBrand || !isBrandEnum || !isInstValid || !isVersionValid) {
        let code = "missing_field";
        if (!isProtocolIntegral) code = "bad_number";
        else if (hasBrand && !isBrandEnum) code = "invalid_enum";
        const err = new Error("malformed hello");
        err.code = code;
        return { status: "refuse", error: err, code };
      }
      if (obj.protocol !== 1) {
        return {
          status: "unsupported",
          value: {
            type: "unsupported",
            protocol: obj.protocol,
            version: obj.version || "",
            behind: obj.protocol > 1 ? "app" : "extension",
          },
        };
      }
    }

    // Step 6: direction check
    if (direction === "extension_to_host" && !directions.extension_to_host.includes(type)) {
      const err = new Error("bad direction");
      err.code = "bad_direction";
      return { status: "refuse", error: err, code: "bad_direction" };
    }
    if (direction === "host_to_extension" && !directions.host_to_extension.includes(type)) {
      const err = new Error("bad direction");
      err.code = "bad_direction";
      return { status: "refuse", error: err, code: "bad_direction" };
    }

    // Step 7: payload length check
    if (type === "batch") {
      if (byteLength > extCap) {
        const err = new Error("oversize batch");
        err.code = "oversize";
        return { status: "refuse", error: err, code: "oversize" };
      }
    } else {
      if (byteLength > controlMax) {
        const err = new Error("oversize control payload");
        err.code = "oversize";
        return { status: "refuse", error: err, code: "oversize" };
      }
    }

    // Step 8: semantic validation
    if (type === "hello_ack" || type === "state") {
      if (!obj.capture || !obj.delivery) {
        const err = new Error("missing capture or delivery");
        err.code = "missing_field";
        return { status: "refuse", error: err, code: "missing_field" };
      }
      if (!captureEnum.includes(obj.capture) || !deliveryEnum.includes(obj.delivery)) {
        const err = new Error("invalid enum in state");
        err.code = "invalid_enum";
        return { status: "refuse", error: err, code: "invalid_enum" };
      }

      if (obj.delivery === "failed") {
        if (!obj.failure || !failureEnum.includes(obj.failure)) {
          const err = new Error("invalid or missing failure code");
          err.code = !obj.failure ? "missing_field" : "invalid_enum";
          return { status: "refuse", error: err, code: err.code };
        }
      } else {
        if (obj.failure !== undefined && obj.failure !== null) {
          const err = new Error("failure present when delivery not failed");
          err.code = "bad_state_ids";
          return { status: "refuse", error: err, code: "bad_state_ids" };
        }
      }

      if (obj.capture === "unavailable" || obj.capture === "not_paired") {
        if (obj.destination_generation || obj.period_id) {
          const err = new Error("ids present when capture is unavailable/not_paired");
          err.code = "bad_state_ids";
          return { status: "refuse", error: err, code: "bad_state_ids" };
        }
      } else if (obj.capture === "permitted") {
        if (!obj.destination_generation || !obj.period_id) {
          const err = new Error("ids missing when capture is permitted");
          err.code = "bad_state_ids";
          return { status: "refuse", error: err, code: "bad_state_ids" };
        }
      } else if (obj.capture === "paused" || obj.capture === "intake_off") {
        if (!obj.destination_generation) {
          const err = new Error("destination_generation missing when paused/intake_off");
          err.code = "bad_state_ids";
          return { status: "refuse", error: err, code: "bad_state_ids" };
        }
      }

      if (obj.freshness_ms !== undefined && obj.freshness_ms !== null) {
        if (typeof obj.freshness_ms !== "number" || obj.freshness_ms < 0 || obj.freshness_ms > 15000) {
          const err = new Error("freshness_ms out of range");
          err.code = "freshness_range";
          return { status: "refuse", error: err, code: "freshness_range" };
        }
      }
    } else if (type === "unsupported") {
      if (obj.protocol === undefined || !obj.behind) {
        const err = new Error("missing field in unsupported");
        err.code = "missing_field";
        return { status: "refuse", error: err, code: "missing_field" };
      }
      if (!behindEnum.includes(obj.behind)) {
        const err = new Error("invalid behind in unsupported");
        err.code = "invalid_enum";
        return { status: "refuse", error: err, code: "invalid_enum" };
      }
    } else if (type === "boundary") {
      if (!obj.destination_generation || !obj.period_id) {
        const err = new Error("missing generation or period_id in boundary");
        err.code = "missing_field";
        return { status: "refuse", error: err, code: "missing_field" };
      }
    } else if (type === "accepted") {
      if (!obj.destination_generation || !obj.inst || !obj.batch_id || !obj.period_id || obj.duplicate === undefined) {
        const err = new Error("missing field in accepted");
        err.code = "missing_field";
        return { status: "refuse", error: err, code: "missing_field" };
      }
      if (typeof obj.duplicate !== "boolean") {
        const err = new Error("duplicate must be boolean");
        err.code = "invalid_enum";
        return { status: "refuse", error: err, code: "invalid_enum" };
      }
      if (!/^[0-9a-f]{32}$/.test(obj.batch_id)) {
        const err = new Error("bad batch id");
        err.code = "bad_batch_id";
        return { status: "refuse", error: err, code: "bad_batch_id" };
      }
    } else if (type === "bye") {
      if (!obj.reason) {
        const err = new Error("missing reason in bye");
        err.code = "missing_field";
        return { status: "refuse", error: err, code: "missing_field" };
      }
      if (!byeReasonEnum.includes(obj.reason)) {
        const err = new Error("invalid bye reason");
        err.code = "invalid_enum";
        return { status: "refuse", error: err, code: "invalid_enum" };
      }
    } else if (type === "batch") {
      if (!obj.destination_generation || !obj.inst || !obj.batch_id || obj.queued_at_ms === undefined || !obj.records) {
        const err = new Error("missing field in batch");
        err.code = "missing_field";
        return { status: "refuse", error: err, code: "missing_field" };
      }
      if (!/^[0-9a-f]{32}$/.test(obj.batch_id)) {
        const err = new Error("bad batch id");
        err.code = "bad_batch_id";
        return { status: "refuse", error: err, code: "bad_batch_id" };
      }
      if (typeof obj.queued_at_ms !== "number" || obj.queued_at_ms < 0 || obj.queued_at_ms > timestampMax) {
        const err = new Error("bad queued_at_ms");
        err.code = "bad_number";
        return { status: "refuse", error: err, code: "bad_number" };
      }

      if (!Array.isArray(obj.records) || obj.records.length === 0) {
        const err = new Error("bad records");
        err.code = "bad_record";
        return { status: "refuse", error: err, code: "bad_record" };
      }
      if (obj.records.length > deltaRecordsMax) {
        const err = new Error("too many deltas");
        err.code = "too_many_deltas";
        return { status: "refuse", error: err, code: "too_many_deltas" };
      }

      const firstRecord = obj.records[0];
      const isSnapshot = firstRecord.t === "segment_start";
      if (isSnapshot) {
        if (obj.records.length !== 1) {
          const err = new Error("multiple snapshots in batch");
          err.code = "bad_record";
          return { status: "refuse", error: err, code: "bad_record" };
        }
      }

      let batchCtx = null;
      let hasCtx = false;

      for (let i = 0; i < obj.records.length; i++) {
        const rec = obj.records[i];
        if (isSnapshot && rec.t !== "segment_start") {
          const err = new Error("mixed snapshot and delta records");
          err.code = "bad_record";
          return { status: "refuse", error: err, code: "bad_record" };
        }
        if (!isSnapshot && rec.t !== "delta") {
          const err = new Error("mixed snapshot and delta records");
          err.code = "bad_record";
          return { status: "refuse", error: err, code: "bad_record" };
        }

        if (rec.inst && rec.inst !== obj.inst) {
          const err = new Error("record inst mismatch");
          err.code = "bad_record";
          err.recordError = { code: "bad_record", row: i, field: "inst", cause: "mismatch" };
          return { status: "refuse", error: err, code: "bad_record", row: i, field: "inst", cause: "mismatch" };
        }

        if (rec.ctx !== undefined) {
          if (!hasCtx) {
            batchCtx = rec.ctx;
            hasCtx = true;
          } else if (rec.ctx !== batchCtx) {
            const err = new Error("mixed context");
            err.code = "mixed_context";
            return { status: "refuse", error: err, code: "mixed_context" };
          }
        } else if (hasCtx && batchCtx !== undefined) {
          const err = new Error("mixed context");
          err.code = "mixed_context";
          return { status: "refuse", error: err, code: "mixed_context" };
        }

        if (rec.snapshot_reason && rec.snapshot_reason !== "delivery_recovery") {
          const err = new Error("invalid snapshot_reason");
          err.code = "invalid_enum";
          return { status: "refuse", error: err, code: "invalid_enum" };
        }

        if (rec.t === "segment_start") {
          if (!Array.isArray(rec.blocks)) {
            const err = new Error("missing blocks in snapshot");
            err.code = "bad_record";
            return { status: "refuse", error: err, code: "bad_record" };
          }
          for (let bIdx = 0; bIdx < rec.blocks.length; bIdx++) {
            const blk = rec.blocks[bIdx];
            if (!blk || typeof blk !== "object") {
              const err = new Error("bad block");
              err.code = "bad_record";
              return { status: "refuse", error: err, code: "bad_record" };
            }
            if (blk.id === undefined) {
              const err = new Error("missing block id");
              err.code = "bad_record";
              err.recordError = { code: "bad_record", row: bIdx, field: "id", cause: "missing" };
              return { status: "refuse", error: err, code: "bad_record", row: bIdx, field: "id", cause: "missing" };
            }
            if (blk.id === "") {
              const err = new Error("empty block id");
              err.code = "bad_record";
              err.recordError = { code: "bad_record", row: bIdx, field: "id", cause: "empty" };
              return { status: "refuse", error: err, code: "bad_record", row: bIdx, field: "id", cause: "empty" };
            }
            if (typeof blk.id === "string" && blk.id.length > idMax) {
              const err = new Error("block id too long");
              err.code = "bad_record";
              err.recordError = { code: "bad_record", row: bIdx, field: "id", cause: "too_long" };
              return { status: "refuse", error: err, code: "bad_record", row: bIdx, field: "id", cause: "too_long" };
            }
          }
        } else if (rec.t === "delta") {
          if (!["add", "update", "remove"].includes(rec.op)) {
            const err = new Error("invalid delta op");
            err.code = "invalid_enum";
            return { status: "refuse", error: err, code: "invalid_enum" };
          }
          const blk = rec.block;
          if (!blk || typeof blk !== "object") {
            const err = new Error("missing block in delta");
            err.code = "bad_record";
            return { status: "refuse", error: err, code: "bad_record" };
          }
          if (blk.id === undefined) {
            const err = new Error("missing block id in delta");
            err.code = "bad_record";
            err.recordError = { code: "bad_record", row: i, field: "id", cause: "missing" };
            return { status: "refuse", error: err, code: "bad_record", row: i, field: "id", cause: "missing" };
          }
          if (blk.id === "") {
            const err = new Error("empty block id in delta");
            err.code = "bad_record";
            err.recordError = { code: "bad_record", row: i, field: "id", cause: "empty" };
            return { status: "refuse", error: err, code: "bad_record", row: i, field: "id", cause: "empty" };
          }
          if (typeof blk.id === "string" && blk.id.length > idMax) {
            const err = new Error("block id too long in delta");
            err.code = "bad_record";
            err.recordError = { code: "bad_record", row: i, field: "id", cause: "too_long" };
            return { status: "refuse", error: err, code: "bad_record", row: i, field: "id", cause: "too_long" };
          }
        }
      }
    }

    return { status: "accept", value: obj };
  }

  // --- Receipt Builder ---

  function buildReply(receipt) {
    const consts = getConsts();
    const receiptClasses = requireConst(consts, "RECEIPT_CLASSES");
    if (receipt.outcome === "accepted" || (!receipt.outcome && receipt.period_id)) {
      return {
        type: "accepted",
        destination_generation: receipt.destination_generation,
        inst: receipt.inst,
        batch_id: receipt.batch_id,
        period_id: receipt.period_id,
        duplicate: Boolean(receipt.duplicate),
      };
    }

    let outcome = receipt.outcome;
    let receiptClass = receipt.class;

    if (!outcome) {
      if (receipt.reason === "unaccepted_lost") {
        outcome = "loss";
      } else if (receipt.reason === "queue_full" || receipt.reason === "age_policy") {
        outcome = "backpressure";
      } else {
        outcome = "rejected";
      }
    }

    if (!receiptClass && receipt.reason) {
      for (const [cls, reasons] of Object.entries(receiptClasses)) {
        if (reasons.includes(receipt.reason)) {
          receiptClass = cls;
          break;
        }
      }
    }

    const out = {
      outcome,
      reason: receipt.reason,
      class: receiptClass || "permanent",
    };
    if (receipt.destination_generation) out.destination_generation = receipt.destination_generation;
    if (receipt.inst) out.inst = receipt.inst;
    if (receipt.batch_id) out.batch_id = receipt.batch_id;
    return out;
  }

  // --- Registration Renderer ---

  function renderRegistration(channel, browser, os, execPath, configRoot) {
    const consts = getConsts();
    const hostsAndIds = requireConst(consts, "HOSTS_AND_IDS");
    const regConfig = requireConst(consts, "REGISTRATION");
    const hostInfo = hostsAndIds[channel];
    if (!hostInfo) throw new Error("unknown channel: " + channel);

    const host = hostInfo.host;
    let id;
    if (browser === "chrome") id = hostInfo.chrome_id;
    else if (browser === "edge") id = hostInfo.edge_id;
    else if (browser === "firefox") id = hostInfo.firefox_id;
    else throw new Error("unknown browser: " + browser);

    const description = regConfig.description;
    const type = regConfig.type;
    const path = execPath || regConfig.path_placeholder;

    const manifest = {
      name: host,
      description,
      path,
      type,
    };

    if (browser === "firefox") {
      manifest.allowed_extensions = [id];
    } else {
      manifest.allowed_origins = [`chrome-extension://${id}/`];
    }

    const key = `${browser}_${os}`;
    const suffixTemplate = regConfig.suffixes[key];
    if (!suffixTemplate) throw new Error("unknown registration platform: " + key);

    const suffix = suffixTemplate.replace("<host>", host);
    let fullPath = suffix;
    if (configRoot) {
      const trimmedRoot = configRoot.replace(/[/\\]+$/, "");
      fullPath = trimmedRoot + (os === "windows" ? "\\" : "/") + suffix;
    }

    const filename = os === "windows" ? host : `${host}.json`;

    return {
      channel,
      browser,
      os,
      host,
      filename,
      path: fullPath,
      json: JSON.stringify(manifest, null, 2) + "\n",
      manifest,
    };
  }

  // --- Predicates ---

  function handshakeExpired(startedMs, nowMs, budgetMs) {
    return Math.max(0, nowMs - startedMs) >= budgetMs;
  }

  function stateRenewalDue(lastMs, nowMs, intervalMs) {
    return Math.max(0, nowMs - lastMs) >= intervalMs;
  }

  function freshnessValueAllowed(freshnessMs) {
    return typeof freshnessMs === "number" && freshnessMs >= 0 && freshnessMs <= 15000;
  }

  function freshnessAuthorizesSkim(issuedMs, freshnessMs, nowMs) {
    return freshnessValueAllowed(freshnessMs) && nowMs >= issuedMs && Math.max(0, nowMs - issuedMs) <= freshnessMs;
  }

  function freshnessAuthorizesDeletion(_issuedMs, _freshnessMs, _nowMs) {
    return false;
  }

  function partialFrameExpired(firstByteMs, nowMs, lifetimeMs) {
    return Math.max(0, nowMs - firstByteMs) >= lifetimeMs;
  }

  function futureBeyondTolerance(observedMs, nowMs, toleranceMs) {
    return Math.max(0, observedMs - nowMs) > toleranceMs;
  }

  function queuedPastOutboxAge(queuedAtMs, nowMs, maxAgeMs) {
    return Math.max(0, nowMs - queuedAtMs) >= maxAgeMs;
  }

  function acceptedPastMinRetention(acceptedAtMs, nowMs, retentionMs) {
    return Math.max(0, nowMs - acceptedAtMs) >= retentionMs;
  }

  function connectionTokenMatches(live, presented) {
    return live === presented;
  }

  function mayRenewOnConnection(live, presented, lastMs, nowMs, intervalMs) {
    return live === presented && Math.max(0, nowMs - lastMs) < intervalMs;
  }

  function captureIsPermitted(state) {
    return (
      state &&
      state.capture === "permitted" &&
      Boolean(state.destination_generation) &&
      Boolean(state.period_id)
    );
  }

  // --- Recipes Builder ---

  function buildRecipe(recipeId) {
    const consts = getConsts();
    const extMax = requireConst(consts, "EXTENSION_TO_HOST_MAX");
    const controlMax = requireConst(consts, "CONTROL_MAX");

    let targetLen;
    let baseObj;
    if (recipeId === "extension_to_host_batch_max") {
      targetLen = extMax;
      baseObj = {
        type: "batch",
        destination_generation: "g",
        inst: "i",
        batch_id: "0123456789abcdef0123456789abcdef",
        queued_at_ms: 0,
        records: [
          {
            t: "segment_start",
            ts: 0,
            blocks: [{ id: "b", text: "x" }],
          },
        ],
        pad: "",
      };
    } else if (recipeId === "extension_to_host_batch_oversize") {
      targetLen = extMax + 1;
      baseObj = {
        type: "batch",
        destination_generation: "g",
        inst: "i",
        batch_id: "0123456789abcdef0123456789abcdef",
        queued_at_ms: 0,
        records: [
          {
            t: "segment_start",
            ts: 0,
            blocks: [{ id: "b", text: "x" }],
          },
        ],
        pad: "",
      };
    } else if (recipeId === "control_payload_max") {
      targetLen = controlMax;
      baseObj = {
        type: "hello",
        protocol: 1,
        version: "1.0.0",
        brand: "chrome",
        inst: "inst1",
        pad: "",
      };
    } else if (recipeId === "control_payload_oversize") {
      targetLen = controlMax + 1;
      baseObj = {
        type: "hello",
        protocol: 1,
        version: "1.0.0",
        brand: "chrome",
        inst: "inst1",
        pad: "",
      };
    } else if (recipeId === "batch_delta_cap_3000") {
      const deltas = [];
      for (let i = 0; i < 1500; i++) {
        deltas.push({ t: "delta", ts: 0, op: "add", block: { id: "a" + i, text: "t" } });
        deltas.push({ t: "delta", ts: 0, op: "remove", block: { id: "r" + i } });
      }
      baseObj = {
        type: "batch",
        destination_generation: "g",
        inst: "i",
        batch_id: "0123456789abcdef0123456789abcdef",
        queued_at_ms: 0,
        records: deltas,
      };
      const bytes = encode(baseObj);
      return { bytes, length: bytes.byteLength };
    } else if (recipeId === "batch_delta_oversize_3001") {
      const deltas = [];
      for (let i = 0; i < 1500; i++) {
        deltas.push({ t: "delta", ts: 0, op: "add", block: { id: "a" + i, text: "t" } });
        deltas.push({ t: "delta", ts: 0, op: "remove", block: { id: "r" + i } });
      }
      deltas.push({ t: "delta", ts: 0, op: "add", block: { id: "extra", text: "t" } });
      baseObj = {
        type: "batch",
        destination_generation: "g",
        inst: "i",
        batch_id: "0123456789abcdef0123456789abcdef",
        queued_at_ms: 0,
        records: deltas,
      };
      const bytes = encode(baseObj);
      return { bytes, length: bytes.byteLength };
    } else {
      throw new Error("unknown recipe: " + recipeId);
    }

    const emptyBytes = encode(baseObj);
    const padLen = targetLen - emptyBytes.byteLength;
    if (padLen < 0) throw new Error("base obj exceeds target length");
    baseObj.pad = "a".repeat(padLen);
    const finalBytes = encode(baseObj);
    if (finalBytes.byteLength !== targetLen) {
      throw new Error(`recipe length mismatch: expected ${targetLen}, got ${finalBytes.byteLength}`);
    }
    return { bytes: finalBytes, length: finalBytes.byteLength };
  }

  globalThis.SolstoneNativeBrowser = {
    encode,
    decode,
    buildReply,
    renderRegistration,
    captureIsPermitted,
    handshakeExpired,
    stateRenewalDue,
    freshnessValueAllowed,
    freshnessAuthorizesSkim,
    freshnessAuthorizesDeletion,
    partialFrameExpired,
    futureBeyondTolerance,
    queuedPastOutboxAge,
    acceptedPastMinRetention,
    connectionTokenMatches,
    mayRenewOnConnection,
    buildRecipe,
  };
})();
