// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

use crate::constants::*;
use crate::frame::Direction;
use serde_json::Value;

pub const ENVELOPE_SCHEMA_STR: &str = include_str!("../../../contracts/native-browser/envelope.schema.json");
pub const JOURNAL_SCHEMA_STR: &str = include_str!("../../../contracts/native-browser/browser.schema.json");

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DecodeOutcome {
    Accept(Value),
    Unsupported {
        protocol: u64,
        version: String,
        behind: String,
    },
    Refuse(DecodeError),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodeError {
    pub code: String,
    pub class: Option<String>,
    pub row: Option<usize>,
    pub field: Option<String>,
    pub cause: Option<String>,
}

impl std::fmt::Display for DecodeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.code)?;
        if let Some(ref cause) = self.cause {
            write!(f, " cause: {}", cause)?;
        }
        if let Some(row) = self.row {
            write!(f, " row: {}", row)?;
        }
        if let Some(ref field) = self.field {
            write!(f, " field: {}", field)?;
        }
        Ok(())
    }
}

impl std::error::Error for DecodeError {}

impl DecodeError {
    pub fn new(code: &str) -> Self {
        Self {
            code: code.to_string(),
            class: None,
            row: None,
            field: None,
            cause: None,
        }
    }

    pub fn with_record_error(code: &str, row: usize, field: &str, cause: &str) -> Self {
        Self {
            code: code.to_string(),
            class: None,
            row: Some(row),
            field: Some(field.to_string()),
            cause: Some(cause.to_string()),
        }
    }
}

use std::sync::OnceLock;

static VALIDATOR: OnceLock<Result<jsonschema::Validator, String>> = OnceLock::new();

pub fn get_validator() -> Result<&'static jsonschema::Validator, DecodeError> {
    let res = VALIDATOR.get_or_init(|| {
        let journal_value: Value = serde_json::from_str(JOURNAL_SCHEMA_STR)
            .map_err(|e| format!("journal schema parse error: {}", e))?;
        let envelope_value: Value = serde_json::from_str(ENVELOPE_SCHEMA_STR)
            .map_err(|e| format!("envelope schema parse error: {}", e))?;
        let registry = jsonschema::Registry::new()
            .add("solstone-journal-format:browser-jsonl", journal_value)
            .map_err(|e| format!("registry add error: {}", e))?
            .prepare()
            .map_err(|e| format!("registry prepare error: {}", e))?;
        let validator = jsonschema::options()
            .with_draft(jsonschema::Draft::Draft202012)
            .offline()
            .with_registry(&registry)
            .build(&envelope_value)
            .map_err(|e| format!("validator build error: {}", e))?;
        Ok(validator)
    });
    match res {
        Ok(v) => Ok(v),
        Err(_) => Err(DecodeError::new("bad_json")),
    }
}

// --- Lone Surrogate Scanner ---

fn scan_lone_surrogates(bytes: &[u8]) -> bool {
    let s = match std::str::from_utf8(bytes) {
        Ok(s) => s,
        Err(_) => return false,
    };

    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\\' {
            if chars.peek() == Some(&'u') {
                chars.next();
                let mut hex = String::new();
                for _ in 0..4 {
                    if let Some(&h) = chars.peek() {
                        if h.is_ascii_hexdigit() {
                            hex.push(h);
                            chars.next();
                        } else {
                            break;
                        }
                    }
                }
                if hex.len() == 4 {
                    if let Ok(code) = u16::from_str_radix(&hex, 16) {
                        if (0xd800..=0xdbff).contains(&code) {
                            // High surrogate, check for \uDCxx..\uDFFF
                            if chars.next() == Some('\\') && chars.next() == Some('u') {
                                let mut low_hex = String::new();
                                for _ in 0..4 {
                                    if let Some(&h) = chars.peek() {
                                        if h.is_ascii_hexdigit() {
                                            low_hex.push(h);
                                            chars.next();
                                        } else {
                                            break;
                                        }
                                    }
                                }
                                if low_hex.len() == 4 {
                                    if let Ok(low_code) = u16::from_str_radix(&low_hex, 16) {
                                        if (0xdc00..=0xdfff).contains(&low_code) {
                                            continue;
                                        }
                                    }
                                }
                            }
                            return true;
                        }
                        if (0xdc00..=0xdfff).contains(&code) {
                            return true;
                        }
                    }
                }
            }
        }
    }
    false
}

// --- Lexeme Scanner & Rewriter ---

fn parse_integer_lexeme(lexeme: &str) -> Result<u64, &'static str> {
    let s = lexeme.trim();
    if s.starts_with('-') {
        return Err("bad_number");
    }
    if s.starts_with('+') || (s.starts_with('0') && s.len() > 1 && s.chars().nth(1).unwrap().is_ascii_digit()) || s.ends_with('.') {
        return Err("bad_json");
    }
    if s.contains('e') || s.contains('E') {
        let parts: Vec<&str> = s.split(['e', 'E']).collect();
        if parts.len() != 2 {
            return Err("bad_json");
        }
        let mantissa: f64 = parts[0].parse().map_err(|_| "bad_json")?;
        let exponent: i32 = parts[1].parse().map_err(|_| "bad_json")?;
        if mantissa < 0.0 {
            return Err("bad_number");
        }
        let val = mantissa * 10f64.powi(exponent);
        if val.fract() != 0.0 || val < 0.0 || val > TIMESTAMP_MAX as f64 {
            return Err("bad_number");
        }
        return Ok(val as u64);
    }
    if s.contains('.') {
        let parts: Vec<&str> = s.split('.').collect();
        if parts.len() != 2 {
            return Err("bad_json");
        }
        if !parts[0].chars().all(|c| c.is_ascii_digit()) || !parts[1].chars().all(|c| c.is_ascii_digit()) {
            return Err("bad_json");
        }
        if !parts[1].trim_end_matches('0').is_empty() {
            return Err("bad_number");
        }
        let val: u64 = parts[0].parse().map_err(|_| "bad_json")?;
        if val > TIMESTAMP_MAX {
            return Err("bad_number");
        }
        return Ok(val);
    }
    if !s.chars().all(|c| c.is_ascii_digit()) {
        return Err("bad_json");
    }
    let val: u64 = s.parse().map_err(|_| "bad_json")?;
    if val > TIMESTAMP_MAX {
        return Err("bad_number");
    }
    Ok(val)
}

fn rewrite_integer_lexemes(text: &str) -> Result<String, &'static str> {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();

    while let Some(c) = chars.next() {
        if c == '"' {
            let mut key = String::new();
            while let Some(&k) = chars.peek() {
                chars.next();
                if k == '"' {
                    break;
                }
                key.push(k);
            }

            out.push('"');
            out.push_str(&key);
            out.push('"');

            let is_target = matches!(
                key.as_str(),
                "protocol" | "queued_at_ms" | "freshness_ms" | "ts" | "n" | "depth"
            );

            // Skip whitespace up to colon
            while let Some(&ws) = chars.peek() {
                if ws.is_whitespace() {
                    out.push(ws);
                    chars.next();
                } else {
                    break;
                }
            }

            if chars.peek() == Some(&':') {
                out.push(':');
                chars.next();

                // Skip whitespace after colon
                while let Some(&ws) = chars.peek() {
                    if ws.is_whitespace() {
                        out.push(ws);
                        chars.next();
                    } else {
                        break;
                    }
                }

                if is_target {
                    if let Some(&first) = chars.peek() {
                        if first != '"' && first != '{' && first != '[' && first != 'n' && first != 't' && first != 'f' {
                            let mut val_lexeme = String::new();
                            while let Some(&v) = chars.peek() {
                                if v == ',' || v == '}' || v == ']' || v.is_whitespace() {
                                    break;
                                }
                                val_lexeme.push(v);
                                chars.next();
                            }
                            let canonical_val = parse_integer_lexeme(&val_lexeme)?;
                            out.push_str(&canonical_val.to_string());
                        }
                    }
                }
            }
        } else {
            out.push(c);
        }
    }

    Ok(out)
}

// --- Canonical JSON Encoder ---

fn escape_canonical_string(s: &str, out: &mut String) -> Result<(), &'static str> {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\x00'..='\x1f' => {
                out.push_str(&format!("\\u{:04x}", c as u32));
            }
            _ => out.push(c),
        }
    }
    out.push('"');
    Ok(())
}

pub fn canonical_stringify(val: &Value, out: &mut String) -> Result<(), &'static str> {
    match val {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                out.push_str(&i.to_string());
            } else if let Some(u) = n.as_u64() {
                out.push_str(&u.to_string());
            } else if let Some(f) = n.as_f64() {
                if f.fract() == 0.0 {
                    out.push_str(&(f as i64).to_string());
                } else {
                    out.push_str(&f.to_string());
                }
            }
        }
        Value::String(s) => escape_canonical_string(s, out)?,
        Value::Array(arr) => {
            out.push('[');
            for (i, item) in arr.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                canonical_stringify(item, out)?;
            }
            out.push(']');
        }
        Value::Object(map) => {
            let msg_type = map.get("type").and_then(|t| t.as_str());
            let record_t = map.get("t").and_then(|t| t.as_str());

            let known_order: &[&str] = if let Some(t) = msg_type {
                match t {
                    "hello" => &["type", "protocol", "version", "brand", "inst"],
                    "hello_ack" | "state" => &[
                        "type",
                        "capture",
                        "delivery",
                        "freshness_ms",
                        "destination_generation",
                        "period_id",
                        "failure",
                        "version",
                    ],
                    "unsupported" => &["type", "protocol", "behind"],
                    "batch" => &[
                        "type",
                        "destination_generation",
                        "inst",
                        "batch_id",
                        "queued_at_ms",
                        "records",
                    ],
                    "boundary" => &["type", "destination_generation", "period_id"],
                    "accepted" => &[
                        "type",
                        "destination_generation",
                        "inst",
                        "batch_id",
                        "period_id",
                        "duplicate",
                    ],
                    "bye" => &["type", "reason"],
                    _ => &[],
                }
            } else if let Some(t) = record_t {
                match t {
                    "segment_start" => &[
                        "t",
                        "ts",
                        "rel",
                        "site",
                        "url",
                        "title",
                        "adapter",
                        "ctx",
                        "inst",
                        "n",
                        "blocks",
                        "snapshot_reason",
                    ],
                    "delta" => &["t", "ts", "rel", "site", "ctx", "inst", "op", "block"],
                    _ => &[],
                }
            } else if map.contains_key("id") || map.contains_key("text") {
                &["id", "text", "type", "depth", "attrs"]
            } else if map.contains_key("label") || map.contains_key("level") || map.contains_key("linkHost") {
                &["label", "level", "linkHost"]
            } else {
                &[]
            };

            let mut ordered_keys: Vec<&str> = Vec::new();
            for &k in known_order {
                if map.contains_key(k) {
                    ordered_keys.push(k);
                }
            }

            let mut unknown_keys: Vec<&str> = map
                .keys()
                .map(|s| s.as_str())
                .filter(|k| !known_order.contains(k))
                .collect();
            unknown_keys.sort();

            ordered_keys.extend(unknown_keys);

            out.push('{');
            for (i, &k) in ordered_keys.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                escape_canonical_string(k, out)?;
                out.push(':');
                canonical_stringify(&map[k], out)?;
            }
            out.push('}');
        }
    }
    Ok(())
}

pub fn encode(val: &Value) -> Result<Vec<u8>, DecodeError> {
    let mut out = String::new();
    canonical_stringify(val, &mut out).map_err(|e| DecodeError::new(e))?;
    Ok(out.into_bytes())
}

// --- Decoder ---

pub fn decode(bytes: &[u8], direction: Direction) -> DecodeOutcome {
    if bytes.is_empty() {
        return DecodeOutcome::Refuse(DecodeError::new("empty_payload"));
    }

    if scan_lone_surrogates(bytes) {
        return DecodeOutcome::Refuse(DecodeError::new("lone_surrogate"));
    }

    let text = match std::str::from_utf8(bytes) {
        Ok(s) => s,
        Err(_) => return DecodeOutcome::Refuse(DecodeError::new("bad_utf8")),
    };

    if text.trim().is_empty() {
        return DecodeOutcome::Refuse(DecodeError::new("empty_payload"));
    }

    let rewritten = match rewrite_integer_lexemes(text) {
        Ok(s) => s,
        Err(e) => return DecodeOutcome::Refuse(DecodeError::new(e)),
    };

    let val: Value = match serde_json::from_str(&rewritten) {
        Ok(v) => v,
        Err(_) => return DecodeOutcome::Refuse(DecodeError::new("bad_json")),
    };

    let obj = match val.as_object() {
        Some(o) => o,
        None => return DecodeOutcome::Refuse(DecodeError::new("bad_json")),
    };

    let msg_type = match obj.get("type").and_then(|t| t.as_str()) {
        Some(t) => t,
        None => return DecodeOutcome::Refuse(DecodeError::new("missing_field")),
    };

    let known_types = ["hello", "hello_ack", "unsupported", "state", "batch", "boundary", "accepted", "bye"];
    if !known_types.contains(&msg_type) {
        return DecodeOutcome::Refuse(DecodeError::new("bad_type"));
    }

    // Step 3: Hello loose shape and unsupported check
    if msg_type == "hello" {
        let protocol_val = obj.get("protocol").and_then(|p| p.as_u64());
        let has_brand = obj.contains_key("brand");
        let brand_str = obj.get("brand").and_then(|b| b.as_str());
        let is_brand_valid = matches!(brand_str, Some("chrome" | "edge" | "firefox"));
        let inst_str = obj.get("inst").and_then(|i| i.as_str());
        let version_str = obj.get("version").and_then(|v| v.as_str());

        let is_inst_valid = inst_str.map(|s| s.len() <= INST_STRING_MAX).unwrap_or(false);
        let is_version_valid = version_str.map(|s| s.len() <= VERSION_MAX).unwrap_or(false);

        if protocol_val.is_none() || !has_brand || !is_brand_valid || !is_inst_valid || !is_version_valid {
            let code = if protocol_val.is_none() {
                "bad_number"
            } else if has_brand && !is_brand_valid {
                "invalid_enum"
            } else {
                "missing_field"
            };
            return DecodeOutcome::Refuse(DecodeError::new(code));
        }

        let protocol = protocol_val.unwrap();
        if protocol != 1 {
            let behind = if protocol > 1 { "app" } else { "extension" };
            return DecodeOutcome::Unsupported {
                protocol,
                version: version_str.unwrap_or("").to_string(),
                behind: behind.to_string(),
            };
        }
    }

    // Step 4: Direction check
    let is_ext_to_host = matches!(msg_type, "hello" | "batch");
    let is_host_to_ext = matches!(msg_type, "hello_ack" | "unsupported" | "state" | "boundary" | "accepted" | "bye");

    if direction == Direction::ExtensionToHost && !is_ext_to_host {
        return DecodeOutcome::Refuse(DecodeError::new("bad_direction"));
    }
    if direction == Direction::HostToExtension && !is_host_to_ext {
        return DecodeOutcome::Refuse(DecodeError::new("bad_direction"));
    }

    // Step 5: Payload length check
    if msg_type == "batch" {
        if bytes.len() > EXTENSION_TO_HOST_MAX {
            return DecodeOutcome::Refuse(DecodeError::new("oversize"));
        }
    } else if bytes.len() > CONTROL_MAX {
        return DecodeOutcome::Refuse(DecodeError::new("oversize"));
    }

    // Step 6 & 7: Semantic and record checks
    if msg_type == "hello_ack" || msg_type == "state" {
        let capture = match obj.get("capture").and_then(|c| c.as_str()) {
            Some(c) => c,
            None => return DecodeOutcome::Refuse(DecodeError::new("missing_field")),
        };
        let delivery = match obj.get("delivery").and_then(|d| d.as_str()) {
            Some(d) => d,
            None => return DecodeOutcome::Refuse(DecodeError::new("missing_field")),
        };

        if !CAPTURE_ENUM.contains(&capture) || !DELIVERY_ENUM.contains(&delivery) {
            return DecodeOutcome::Refuse(DecodeError::new("invalid_enum"));
        }

        if delivery == "failed" {
            let failure = match obj.get("failure").and_then(|f| f.as_str()) {
                Some(f) => f,
                None => return DecodeOutcome::Refuse(DecodeError::new("missing_field")),
            };
            if !FAILURE_ENUM.contains(&failure) {
                return DecodeOutcome::Refuse(DecodeError::new("invalid_enum"));
            }
        } else if obj.contains_key("failure") && !obj.get("failure").unwrap().is_null() {
            return DecodeOutcome::Refuse(DecodeError::new("bad_state_ids"));
        }

        let gen = obj.get("destination_generation").and_then(|g| g.as_str());
        let period = obj.get("period_id").and_then(|p| p.as_str());

        if capture == "unavailable" || capture == "not_paired" {
            if gen.is_some() || period.is_some() {
                return DecodeOutcome::Refuse(DecodeError::new("bad_state_ids"));
            }
        } else if capture == "permitted" {
            if gen.is_none() || period.is_none() {
                return DecodeOutcome::Refuse(DecodeError::new("bad_state_ids"));
            }
        } else if (capture == "paused" || capture == "intake_off") && gen.is_none() {
            return DecodeOutcome::Refuse(DecodeError::new("bad_state_ids"));
        }

        if let Some(f) = obj.get("freshness_ms") {
            if !f.is_null() {
                if let Some(freshness) = f.as_u64() {
                    if freshness > FRESHNESS_MS_MAX {
                        return DecodeOutcome::Refuse(DecodeError::new("freshness_range"));
                    }
                } else {
                    return DecodeOutcome::Refuse(DecodeError::new("freshness_range"));
                }
            }
        }
    } else if msg_type == "unsupported" {
        if obj.get("protocol").and_then(|p| p.as_u64()).is_none() || !obj.contains_key("behind") {
            return DecodeOutcome::Refuse(DecodeError::new("missing_field"));
        }
        let behind = match obj.get("behind").and_then(|b| b.as_str()) {
            Some(b) => b,
            None => return DecodeOutcome::Refuse(DecodeError::new("missing_field")),
        };
        if !BEHIND_ENUM.contains(&behind) {
            return DecodeOutcome::Refuse(DecodeError::new("invalid_enum"));
        }
    } else if msg_type == "boundary" {
        if obj.get("destination_generation").and_then(|g| g.as_str()).is_none()
            || obj.get("period_id").and_then(|p| p.as_str()).is_none()
        {
            return DecodeOutcome::Refuse(DecodeError::new("missing_field"));
        }
    } else if msg_type == "accepted" {
        if obj.get("destination_generation").and_then(|g| g.as_str()).is_none()
            || obj.get("inst").and_then(|i| i.as_str()).is_none()
            || obj.get("batch_id").and_then(|b| b.as_str()).is_none()
            || obj.get("period_id").and_then(|p| p.as_str()).is_none()
            || !obj.contains_key("duplicate")
        {
            return DecodeOutcome::Refuse(DecodeError::new("missing_field"));
        }
        if obj.get("duplicate").and_then(|d| d.as_bool()).is_none() {
            return DecodeOutcome::Refuse(DecodeError::new("invalid_enum"));
        }
        let batch_id = obj.get("batch_id").unwrap().as_str().unwrap();
        if batch_id.len() != 32 || !batch_id.chars().all(|c| matches!(c, '0'..='9' | 'a'..='f')) {
            return DecodeOutcome::Refuse(DecodeError::new("bad_batch_id"));
        }
    } else if msg_type == "bye" {
        if !obj.contains_key("reason") {
            return DecodeOutcome::Refuse(DecodeError::new("missing_field"));
        }
        let reason = match obj.get("reason").and_then(|r| r.as_str()) {
            Some(r) => r,
            None => return DecodeOutcome::Refuse(DecodeError::new("missing_field")),
        };
        if !BYE_REASON_ENUM.contains(&reason) {
            return DecodeOutcome::Refuse(DecodeError::new("invalid_enum"));
        }
    } else if msg_type == "batch" {
        let inst = match obj.get("inst").and_then(|i| i.as_str()) {
            Some(i) => i,
            None => return DecodeOutcome::Refuse(DecodeError::new("missing_field")),
        };
        if obj.get("destination_generation").and_then(|g| g.as_str()).is_none() || obj.get("queued_at_ms").is_none() {
            return DecodeOutcome::Refuse(DecodeError::new("missing_field"));
        }
        let batch_id = match obj.get("batch_id").and_then(|b| b.as_str()) {
            Some(b) => b,
            None => return DecodeOutcome::Refuse(DecodeError::new("missing_field")),
        };
        if batch_id.len() != 32 || !batch_id.chars().all(|c| matches!(c, '0'..='9' | 'a'..='f')) {
            return DecodeOutcome::Refuse(DecodeError::new("bad_batch_id"));
        }

        let records = match obj.get("records").and_then(|r| r.as_array()) {
            Some(r) => r,
            None => return DecodeOutcome::Refuse(DecodeError::new("bad_record")),
        };

        if records.is_empty() {
            return DecodeOutcome::Refuse(DecodeError::new("bad_record"));
        }
        if records.len() > DELTA_RECORDS_MAX {
            return DecodeOutcome::Refuse(DecodeError::new("too_many_deltas"));
        }

        let first = &records[0];
        let is_snapshot = first.get("t").and_then(|t| t.as_str()) == Some("segment_start");
        if is_snapshot && records.len() != 1 {
            return DecodeOutcome::Refuse(DecodeError::new("bad_record"));
        }

        let mut batch_ctx: Option<&str> = None;
        let mut has_ctx = false;

        for (i, rec) in records.iter().enumerate() {
            let t = rec.get("t").and_then(|t| t.as_str());
            if is_snapshot && t != Some("segment_start") {
                return DecodeOutcome::Refuse(DecodeError::new("bad_record"));
            }
            if !is_snapshot && t != Some("delta") {
                return DecodeOutcome::Refuse(DecodeError::new("bad_record"));
            }

            if let Some(r_inst) = rec.get("inst").and_then(|i| i.as_str()) {
                if r_inst != inst {
                    return DecodeOutcome::Refuse(DecodeError::with_record_error("bad_record", i, "inst", "mismatch"));
                }
            }

            if let Some(ctx_val) = rec.get("ctx") {
                let ctx_str = ctx_val.as_str().unwrap_or("");
                if !has_ctx {
                    batch_ctx = Some(ctx_str);
                    has_ctx = true;
                } else if batch_ctx != Some(ctx_str) {
                    return DecodeOutcome::Refuse(DecodeError::new("mixed_context"));
                }
            } else if has_ctx && batch_ctx.is_some() {
                return DecodeOutcome::Refuse(DecodeError::new("mixed_context"));
            }

            if let Some(reason) = rec.get("snapshot_reason").and_then(|r| r.as_str()) {
                if reason != "delivery_recovery" {
                    return DecodeOutcome::Refuse(DecodeError::new("invalid_enum"));
                }
            }

            if t == Some("segment_start") {
                let blocks = match rec.get("blocks").and_then(|b| b.as_array()) {
                    Some(b) => b,
                    None => return DecodeOutcome::Refuse(DecodeError::new("bad_record")),
                };
                for (b_idx, blk) in blocks.iter().enumerate() {
                    let id_opt = blk.get("id");
                    if id_opt.is_none() {
                        return DecodeOutcome::Refuse(DecodeError::with_record_error("bad_record", b_idx, "id", "missing"));
                    }
                    let id_str = id_opt.unwrap().as_str().unwrap_or("");
                    if id_str.is_empty() {
                        return DecodeOutcome::Refuse(DecodeError::with_record_error("bad_record", b_idx, "id", "empty"));
                    }
                    if id_str.chars().count() > ID_STRING_MAX {
                        return DecodeOutcome::Refuse(DecodeError::with_record_error("bad_record", b_idx, "id", "too_long"));
                    }
                }
            } else if t == Some("delta") {
                let op = match rec.get("op").and_then(|o| o.as_str()) {
                    Some(o) => o,
                    None => return DecodeOutcome::Refuse(DecodeError::new("invalid_enum")),
                };
                if !matches!(op, "add" | "update" | "remove") {
                    return DecodeOutcome::Refuse(DecodeError::new("invalid_enum"));
                }
                let blk = match rec.get("block") {
                    Some(b) if b.is_object() => b,
                    _ => return DecodeOutcome::Refuse(DecodeError::new("bad_record")),
                };
                let id_opt = blk.get("id");
                if id_opt.is_none() {
                    return DecodeOutcome::Refuse(DecodeError::with_record_error("bad_record", i, "id", "missing"));
                }
                let id_str = id_opt.unwrap().as_str().unwrap_or("");
                if id_str.is_empty() {
                    return DecodeOutcome::Refuse(DecodeError::with_record_error("bad_record", i, "id", "empty"));
                }
                if id_str.chars().count() > ID_STRING_MAX {
                    return DecodeOutcome::Refuse(DecodeError::with_record_error("bad_record", i, "id", "too_long"));
                }
            }
        }
    }

    DecodeOutcome::Accept(val)
}

// --- Recipe Builder in Rust ---

pub fn build_recipe(recipe_id: &str) -> Result<Vec<u8>, &'static str> {
    let mut base_obj = match recipe_id {
        "extension_to_host_batch_max" | "extension_to_host_batch_oversize" => {
            serde_json::json!({
                "type": "batch",
                "destination_generation": "g",
                "inst": "i",
                "batch_id": "0123456789abcdef0123456789abcdef",
                "queued_at_ms": 0,
                "records": [{
                    "t": "segment_start",
                    "ts": 0,
                    "blocks": [{"id": "b", "text": "x"}]
                }],
                "pad": ""
            })
        }
        "control_payload_max" | "control_payload_oversize" => {
            serde_json::json!({
                "type": "hello",
                "protocol": 1,
                "version": "1.0.0",
                "brand": "chrome",
                "inst": "inst1",
                "pad": ""
            })
        }
        "batch_delta_cap_3000" => {
            let mut deltas = Vec::new();
            for i in 0..1500 {
                deltas.push(serde_json::json!({"t": "delta", "ts": 0, "op": "add", "block": {"id": format!("a{}", i), "text": "t"}}));
                deltas.push(serde_json::json!({"t": "delta", "ts": 0, "op": "remove", "block": {"id": format!("r{}", i)}}));
            }
            let obj = serde_json::json!({
                "type": "batch",
                "destination_generation": "g",
                "inst": "i",
                "batch_id": "0123456789abcdef0123456789abcdef",
                "queued_at_ms": 0,
                "records": deltas
            });
            return encode(&obj).map_err(|_| "encode error");
        }
        "batch_delta_oversize_3001" => {
            let mut deltas = Vec::new();
            for i in 0..1500 {
                deltas.push(serde_json::json!({"t": "delta", "ts": 0, "op": "add", "block": {"id": format!("a{}", i), "text": "t"}}));
                deltas.push(serde_json::json!({"t": "delta", "ts": 0, "op": "remove", "block": {"id": format!("r{}", i)}}));
            }
            deltas.push(serde_json::json!({"t": "delta", "ts": 0, "op": "add", "block": {"id": "extra", "text": "t"}}));
            let obj = serde_json::json!({
                "type": "batch",
                "destination_generation": "g",
                "inst": "i",
                "batch_id": "0123456789abcdef0123456789abcdef",
                "queued_at_ms": 0,
                "records": deltas
            });
            return encode(&obj).map_err(|_| "encode error");
        }
        _ => return Err("unknown recipe"),
    };

    let target_len = match recipe_id {
        "extension_to_host_batch_max" => EXTENSION_TO_HOST_MAX,
        "extension_to_host_batch_oversize" => EXTENSION_TO_HOST_MAX + 1,
        "control_payload_max" => CONTROL_MAX,
        "control_payload_oversize" => CONTROL_MAX + 1,
        _ => return Err("unknown target length"),
    };

    let empty_bytes = encode(&base_obj).map_err(|_| "encode error")?;
    let pad_len = target_len - empty_bytes.len();
    base_obj["pad"] = Value::String("a".repeat(pad_len));

    let final_bytes = encode(&base_obj).map_err(|_| "encode error")?;
    if final_bytes.len() != target_len {
        return Err("recipe length mismatch");
    }

    Ok(final_bytes)
}

pub fn build_reply(receipt: &Value) -> Result<Value, &'static str> {
    if receipt.get("outcome").and_then(|o| o.as_str()) == Some("accepted")
        || (receipt.get("outcome").is_none() && receipt.get("period_id").is_some())
    {
        return Ok(serde_json::json!({
            "type": "accepted",
            "destination_generation": receipt.get("destination_generation").cloned().unwrap_or(Value::Null),
            "inst": receipt.get("inst").cloned().unwrap_or(Value::Null),
            "batch_id": receipt.get("batch_id").cloned().unwrap_or(Value::Null),
            "period_id": receipt.get("period_id").cloned().unwrap_or(Value::Null),
            "duplicate": receipt.get("duplicate").and_then(|d| d.as_bool()).unwrap_or(false),
        }));
    }

    let reason = receipt.get("reason").and_then(|r| r.as_str());
    let outcome = if let Some(o) = receipt.get("outcome").and_then(|o| o.as_str()) {
        o.to_string()
    } else {
        match reason {
            Some("unaccepted_lost") => "loss".to_string(),
            Some("queue_full") | Some("age_policy") => "backpressure".to_string(),
            _ => "rejected".to_string(),
        }
    };

    let receipt_class = if let Some(c) = receipt.get("class").and_then(|c| c.as_str()) {
        c.to_string()
    } else {
        match reason {
            Some("queue_full") | Some("age_policy") => "backpressure".to_string(),
            Some("unaccepted_lost") => "loss".to_string(),
            Some("snapshot_required") | Some("resource_exhausted") => "retryable".to_string(),
            Some("malformed") | Some("oversize") | Some("stale_generation") | Some("expired_unaccepted") => {
                "permanent".to_string()
            }
            _ => "permanent".to_string(),
        }
    };

    let mut map = serde_json::Map::new();
    map.insert("outcome".to_string(), Value::String(outcome));
    if let Some(r) = reason {
        map.insert("reason".to_string(), Value::String(r.to_string()));
    }
    map.insert("class".to_string(), Value::String(receipt_class));

    if let Some(dg) = receipt.get("destination_generation") {
        if !dg.is_null() {
            map.insert("destination_generation".to_string(), dg.clone());
        }
    }
    if let Some(inst) = receipt.get("inst") {
        if !inst.is_null() {
            map.insert("inst".to_string(), inst.clone());
        }
    }
    if let Some(bid) = receipt.get("batch_id") {
        if !bid.is_null() {
            map.insert("batch_id".to_string(), bid.clone());
        }
    }

    Ok(Value::Object(map))
}

