// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

use native_browser_frame::*;

#[test]
fn test_predicates_boundaries() {
    // Handshake budget
    assert!(!handshake_expired(1000, 1499, 500));
    assert!(handshake_expired(1000, 1500, 500)); // pins now == start + budget
    assert!(handshake_expired(1000, 1501, 500));

    // State renewal interval
    assert!(!state_renewal_due(1000, 1499, 500));
    assert!(state_renewal_due(1000, 1500, 500)); // pins now == last + interval
    assert!(state_renewal_due(1000, 1501, 500));

    // may_renew_on_connection: live == presented && now - last < interval
    assert!(may_renew_on_connection(42, 42, 1000, 1499, 500));
    assert!(!may_renew_on_connection(42, 42, 1000, 1500, 500)); // pins now == last + interval as not renewable
    assert!(!may_renew_on_connection(42, 99, 1000, 1100, 500)); // mismatched token

    // Freshness
    assert!(freshness_value_allowed(0));
    assert!(freshness_value_allowed(15000));
    assert!(!freshness_value_allowed(15001));

    assert!(freshness_authorizes_skim(1000, 5000, 1000));
    assert!(freshness_authorizes_skim(1000, 5000, 6000));
    assert!(!freshness_authorizes_skim(1000, 5000, 6001));
    assert!(!freshness_authorizes_skim(2000, 5000, 1000)); // now < issued

    assert!(!freshness_authorizes_deletion(1000, 5000, 2000)); // unconditionally false

    // Future tolerance
    assert!(!future_beyond_tolerance(1050, 1000, 60));
    assert!(future_beyond_tolerance(1061, 1000, 60));

    // Outbox age
    assert!(!queued_past_outbox_age(1000, 1099, 100));
    assert!(queued_past_outbox_age(1000, 1100, 100));

    // Accepted retention
    assert!(!accepted_past_min_retention(1000, 1099, 100));
    assert!(accepted_past_min_retention(1000, 1100, 100));

    // Connection token
    assert!(connection_token_matches(12345, 12345));
    assert!(!connection_token_matches(12345, 67890));

    // Capture permitted
    let state_ok = serde_json::json!({
        "type": "state",
        "capture": "permitted",
        "delivery": "delivered",
        "destination_generation": "g1",
        "period_id": "p1",
        "version": "1.0.0"
    });
    assert!(capture_is_permitted(&state_ok));

    let state_paused = serde_json::json!({
        "type": "state",
        "capture": "paused",
        "delivery": "delivered",
        "destination_generation": "g1",
        "version": "1.0.0"
    });
    assert!(!capture_is_permitted(&state_paused));
}
