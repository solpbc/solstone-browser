// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

(function () {
  "use strict";

  globalThis.SolstoneNativeBrowserConstants = Object.freeze({
  "BUNDLE_VERSION": "1.0.0",
  "WIRE_PROTOCOL": 1,
  "EXTENSION_TO_HOST_MAX": 33554432,
  "HOST_TO_EXTENSION_MAX": 65536,
  "CONTROL_MAX": 65536,
  "DELTA_RECORDS_MAX": 3000,
  "BATCH_ID_HEX_LEN": 32,
  "FILE_MAX": 50331648,
  "OUTBOX_BYTES_MAX": 67108864,
  "OUTBOX_AGE_MS_MAX": 600000,
  "SPOOL_BYTES_MAX": 536870912,
  "SPOOL_AGE_MS_MAX": 604800000,
  "FUTURE_SKEW_MS_MAX": 60000,
  "ACCEPTED_RETENTION_MS_MIN": 1200000,
  "HANDSHAKE_MS_BUDGET": 5000,
  "STATE_RENEWAL_MS_INTERVAL": 5000,
  "FRESHNESS_MS_MAX": 15000,
  "PARTIAL_FRAME_MS_LIFETIME": 30000,
  "TIMESTAMP_MAX": 9007199254740991,
  "VERSION_MAX": 64,
  "GENERATION_MAX": 128,
  "PERIOD_ID_MAX": 128,
  "FAILURE_CODE_MAX": 64,
  "INST_STRING_MAX": 128,
  "ID_STRING_MAX": 256,
  "TITLE_STRING_MAX": 8192,
  "URL_STRING_MAX": 32768,
  "SITE_STRING_MAX": 512,
  "ADAPTER_STRING_MAX": 64,
  "CTX_STRING_MAX": 256,
  "TYPE_STRING_MAX": 64,
  "LINK_HOST_STRING_MAX": 512,
  "LEVEL_STRING_MAX": 16,
  "LABEL_STRING_MAX": 300,
  "TEXT_MAX": 2001,
  "BLOCK_DEPTH_MAX": 4096,
  "BLOCKS_MAX": 1500,
  "DIRECTIONS": {
    "extension_to_host": [
      "hello",
      "batch"
    ],
    "host_to_extension": [
      "hello_ack",
      "unsupported",
      "state",
      "boundary",
      "accepted",
      "bye"
    ]
  },
  "BRAND_ENUM": [
    "chrome",
    "edge",
    "firefox"
  ],
  "CAPTURE_ENUM": [
    "unavailable",
    "not_paired",
    "permitted",
    "paused",
    "intake_off"
  ],
  "DELIVERY_ENUM": [
    "unknown",
    "kept_locally",
    "delivered",
    "idle",
    "failed"
  ],
  "FAILURE_ENUM": [
    "relay_unavailable",
    "journal_rejected",
    "local_io"
  ],
  "BYE_REASON_ENUM": [
    "shutdown",
    "replaced",
    "update"
  ],
  "SNAPSHOT_REASON_ENUM": [
    "delivery_recovery"
  ],
  "BEHIND_ENUM": [
    "app",
    "extension"
  ],
  "HOSTS_AND_IDS": {
    "production": {
      "host": "app.solstone.browser",
      "chrome_id": "eibbeeoifjoabddfmgeggnageolkcnim",
      "edge_id": "eibbeeoifjoabddfmgeggnageolkcnim",
      "firefox_id": "browser@solstone.app"
    },
    "dev": {
      "host": "app.solstone.browser.dev",
      "chrome_id": "fgfnkcefedeheoeamppkiiloncfekakf",
      "edge_id": "fgfnkcefedeheoeamppkiiloncfekakf",
      "firefox_id": "browser.dev@solstone.app"
    }
  },
  "REGISTRATION": {
    "description": "Solstone browser host",
    "type": "stdio",
    "path_placeholder": "__PATH__",
    "suffixes": {
      "chrome_linux": ".config/google-chrome/NativeMessagingHosts/<host>.json",
      "edge_linux": ".config/microsoft-edge/NativeMessagingHosts/<host>.json",
      "firefox_linux": ".mozilla/native-messaging-hosts/<host>.json",
      "chrome_macos": "Library/Application Support/Google/Chrome/NativeMessagingHosts/<host>.json",
      "edge_macos": "Library/Application Support/Microsoft Edge/NativeMessagingHosts/<host>.json",
      "firefox_macos": "Library/Application Support/Mozilla/NativeMessagingHosts/<host>.json",
      "chrome_windows": "Software\\Google\\Chrome\\NativeMessagingHosts\\<host>",
      "edge_windows": "Software\\Microsoft\\Edge\\NativeMessagingHosts\\<host>",
      "firefox_windows": "Software\\Mozilla\\NativeMessagingHosts\\<host>"
    }
  },
  "RECEIPT_CLASSES": {
    "retryable": [
      "snapshot_required",
      "resource_exhausted"
    ],
    "permanent": [
      "malformed",
      "oversize",
      "stale_generation",
      "expired_unaccepted"
    ],
    "backpressure": [
      "queue_full",
      "age_policy"
    ],
    "loss": [
      "unaccepted_lost"
    ]
  },
  "CANONICAL_KEY_ORDER": {
    "hello": [
      "type",
      "protocol",
      "version",
      "brand",
      "inst"
    ],
    "hello_ack": [
      "type",
      "capture",
      "delivery",
      "freshness_ms",
      "destination_generation",
      "period_id",
      "failure",
      "version"
    ],
    "unsupported": [
      "type",
      "protocol",
      "behind"
    ],
    "state": [
      "type",
      "capture",
      "delivery",
      "freshness_ms",
      "destination_generation",
      "period_id",
      "failure",
      "version"
    ],
    "batch": [
      "type",
      "destination_generation",
      "inst",
      "batch_id",
      "queued_at_ms",
      "records"
    ],
    "boundary": [
      "type",
      "destination_generation",
      "period_id"
    ],
    "accepted": [
      "type",
      "destination_generation",
      "inst",
      "batch_id",
      "period_id",
      "duplicate"
    ],
    "bye": [
      "type",
      "reason"
    ],
    "snapshot_record": [
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
      "snapshot_reason"
    ],
    "delta_record": [
      "t",
      "ts",
      "rel",
      "site",
      "ctx",
      "inst",
      "op",
      "block"
    ],
    "block": [
      "id",
      "text",
      "type",
      "depth",
      "attrs"
    ],
    "block_attrs": [
      "label",
      "level",
      "linkHost"
    ]
  }
});
})();
