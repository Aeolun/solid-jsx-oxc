//! Tests for the compile-time hydration slot-order analysis
//! (`analyze_hydration_order`). Covers both detected shapes (out-of-order
//! `children()` and mixed hoisted+inline), the dependency guard, the mode
//! gate, and the `hydratable` gate.

use solid_jsx_oxc::{analyze_hydration_order, HydrationOrderMode, Severity, TransformOptions};

fn opts(mode: HydrationOrderMode, hydratable: bool) -> TransformOptions<'static> {
    TransformOptions {
        hydratable,
        hydration_order_check: mode,
        ..TransformOptions::solid_defaults()
    }
}

fn errors(source: &str) -> Vec<String> {
    analyze_hydration_order(source, &opts(HydrationOrderMode::Error, true))
        .into_iter()
        .filter(|d| d.severity == Severity::Error)
        .map(|d| d.message)
        .collect()
}

// ---------------------------------------------------------------------------
// Check 1 — out-of-order children()
// ---------------------------------------------------------------------------

/// Alert-shape: `body` declared before `icon`, but `icon` rendered first.
const ALERT_BAD: &str = r#"
import { children } from "solid-js";
const Alert = (props) => {
    const body = children(() => props.children);
    const icon = children(() => props.icon);
    return (
        <div>
            <span class="icon">{icon()}</span>
            <span class="body">{body()}</span>
        </div>
    );
};
"#;

/// Reordered: `icon` declared before `body`, matching render order.
const ALERT_GOOD: &str = r#"
import { children } from "solid-js";
const Alert = (props) => {
    const icon = children(() => props.icon);
    const body = children(() => props.children);
    return (
        <div>
            <span class="icon">{icon()}</span>
            <span class="body">{body()}</span>
        </div>
    );
};
"#;

#[test]
fn out_of_order_children_is_flagged() {
    let errs = errors(ALERT_BAD);
    assert_eq!(errs.len(), 1, "expected exactly one error, got {errs:?}");
    assert!(errs[0].contains("icon"), "message names the slots: {}", errs[0]);
    assert!(errs[0].contains("body"), "message names the slots: {}", errs[0]);
}

#[test]
fn in_order_children_is_clean() {
    assert!(errors(ALERT_GOOD).is_empty());
}

// ---------------------------------------------------------------------------
// Dependency guard — a reorder that would break code must NOT be flagged
// ---------------------------------------------------------------------------

/// `b` depends on `a` (its callback references `a`), so even though `b` renders
/// before `a`, moving `b` above `a` would break it → no diagnostic.
const DEP_GUARDED: &str = r#"
import { children } from "solid-js";
const C = (props) => {
    const a = children(() => props.a);
    const b = children(() => a());
    return (
        <div>
            <span>{b()}</span>
            <span>{a()}</span>
        </div>
    );
};
"#;

#[test]
fn dependency_guard_suppresses_flag() {
    assert!(
        errors(DEP_GUARDED).is_empty(),
        "dependency-guarded reorder should not be flagged: {:?}",
        errors(DEP_GUARDED)
    );
}

// ---------------------------------------------------------------------------
// Check 2 — mixed hoisted + inline
// ---------------------------------------------------------------------------

/// ListItem-shape: a `children()`-resolved slot (`trailing`) renders *after* an
/// inline element insert (`props.leading`).
const MIXED_BAD: &str = r#"
import { children } from "solid-js";
const ListItem = (props) => {
    const trailing = children(() => props.trailing);
    return (
        <div>
            <span class="lead">{props.leading}</span>
            <span class="trail">{trailing()}</span>
        </div>
    );
};
"#;

/// All slots routed through children() in DOM order → clean.
const MIXED_GOOD: &str = r#"
import { children } from "solid-js";
const ListItem = (props) => {
    const leading = children(() => props.leading);
    const trailing = children(() => props.trailing);
    return (
        <div>
            <span class="lead">{leading()}</span>
            <span class="trail">{trailing()}</span>
        </div>
    );
};
"#;

#[test]
fn mixed_hoisted_and_inline_is_flagged() {
    let errs = errors(MIXED_BAD);
    assert_eq!(errs.len(), 1, "expected exactly one error, got {errs:?}");
    assert!(
        errs[0].contains("trailing"),
        "message names the late slot: {}",
        errs[0]
    );
}

#[test]
fn all_through_children_in_order_is_clean() {
    assert!(errors(MIXED_GOOD).is_empty());
}

// ---------------------------------------------------------------------------
// Non-hazard shapes — must stay clean
// ---------------------------------------------------------------------------

/// A single children() slot rendered inline — no ordering hazard.
const SINGLE_SLOT: &str = r#"
import { children } from "solid-js";
const C = (props) => {
    const only = children(() => props.only);
    return <div><span>{only()}</span></div>;
};
"#;

/// An inline primitive insert (`{props.label}` used as text) before a slot must
/// not be treated as an element insert (it's a member expr, so it IS treated as
/// a potential element — documents the accepted heuristic FP).
const PRIMITIVE_INLINE: &str = r#"
import { children } from "solid-js";
const C = (props) => {
    const trailing = children(() => props.trailing);
    return (
        <div>
            {"static text"}
            {42}
            <span>{trailing()}</span>
        </div>
    );
};
"#;

#[test]
fn single_slot_is_clean() {
    assert!(errors(SINGLE_SLOT).is_empty());
}

#[test]
fn literal_inline_inserts_are_not_element_inserts() {
    // String/number literals before a slot are obvious primitives → no flag.
    assert!(
        errors(PRIMITIVE_INLINE).is_empty(),
        "literals should not count as inline element inserts: {:?}",
        errors(PRIMITIVE_INLINE)
    );
}

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

#[test]
fn not_hydratable_produces_no_diagnostics() {
    let diags = analyze_hydration_order(ALERT_BAD, &opts(HydrationOrderMode::Error, false));
    assert!(diags.is_empty(), "gate on hydratable: {diags:?}");
}

#[test]
fn mode_off_produces_no_diagnostics() {
    let diags = analyze_hydration_order(ALERT_BAD, &opts(HydrationOrderMode::Off, true));
    assert!(diags.is_empty(), "mode Off disables the check: {diags:?}");
}

#[test]
fn mode_warn_emits_warnings_not_errors() {
    let diags = analyze_hydration_order(ALERT_BAD, &opts(HydrationOrderMode::Warn, true));
    assert_eq!(diags.len(), 1);
    assert_eq!(diags[0].severity, Severity::Warning);
}

#[test]
fn no_children_import_is_clean() {
    let source = r#"
const C = (props) => <div><span>{props.icon}</span>{props.children}</div>;
"#;
    assert!(errors(source).is_empty());
}
