//! Compile-time hydration slot-order analysis.
//!
//! SolidJS SSR allocates hydration keys in **execution order** on the server
//! (eager `children()`/`createMemo` resolve at their declaration point; the
//! `ssrHydrationKey()` interpolations fire as the template string is assembled)
//! but the client consumes those keys in **DOM-walk order** during hydration.
//! When a component resolves keyed element slots in an order that differs from
//! the order they appear in the DOM, the two counters disagree and the client
//! throws `Hydration Mismatch. Unable to find DOM nodes for hydration key …`.
//!
//! This is the stock dom-expressions contract (it reproduces identically under
//! `babel-plugin-jsx-dom-expressions`), so it can't be fixed in codegen. Instead
//! this pass flags the two source shapes that trigger it, at build time:
//!
//!   1. **Out-of-order `children()`** — element slots resolved through
//!      `children()` whose render order in the JSX differs from their
//!      declaration order. (Deterministic. Dependency-guarded: if a fix would
//!      require moving a slot before one it depends on, we stay silent.)
//!   2. **Mixed hoisted + inline** — a `children()`-resolved slot rendered in
//!      the DOM *after* an inline element insert (a slot resolved lazily at its
//!      template position). Heuristic: the compiler can't prove an inline
//!      `{local.x}` is element-valued vs a string, so this can over-report; the
//!      fix (route all slots through `children()` in DOM order, or none) is
//!      always safe.
//!
//! Limitations (v1): only `children()` is tracked (not `createMemo`); the solid
//! `children` import is matched by local name (a locally shadowed `children`
//! could be misattributed — extremely rare); render order is only tracked
//! within a single function's own returned JSX (nested render-prop closures are
//! analyzed as their own scope).

use common::{Diagnostic, HydrationOrderMode, Severity};
use oxc_ast::ast::*;
use oxc_ast_visit::{walk, Visit};
use oxc_span::{GetSpan, Span};
use std::collections::HashSet;

/// Local names bound to the solid-js `children` import.
const CHILDREN_IMPORT: &str = "children";
const SOLID_SOURCES: &[&str] = &["solid-js", "solid-js/store", "solid-js/web"];

/// A `const NAME = children(() => …)` binding in a component body.
struct Slot {
    name: String,
    decl_index: usize,
    decl_span: Span,
    /// Identifiers referenced inside the `children()` callback — used to avoid
    /// flagging a reorder that would move a slot before one it depends on.
    deps: HashSet<String>,
}

/// A slot invocation (`NAME()`) recorded in DOM order.
struct SlotRender {
    slot_index: usize,
    pos: usize,
}

/// Run the analysis over a parsed program, returning diagnostics.
pub fn analyze<'a>(
    program: &Program<'a>,
    source: &'a str,
    mode: HydrationOrderMode,
) -> Vec<Diagnostic> {
    let Some(severity) = mode.severity() else {
        return Vec::new();
    };
    let mut analyzer = Analyzer {
        children_names: collect_children_imports(program),
        severity,
        diagnostics: Vec::new(),
        source,
    };
    if analyzer.children_names.is_empty() {
        // No `children()` in scope → nothing this pass can flag.
        return Vec::new();
    }
    analyzer.visit_program(program);
    analyzer.diagnostics
}

/// Collect the local names under which solid-js's `children` is imported.
fn collect_children_imports(program: &Program) -> HashSet<String> {
    let mut names = HashSet::new();
    for stmt in &program.body {
        let Statement::ImportDeclaration(import) = stmt else {
            continue;
        };
        let source = import.source.value.as_str();
        if !SOLID_SOURCES.iter().any(|s| source.starts_with(s)) {
            continue;
        }
        let Some(specifiers) = &import.specifiers else {
            continue;
        };
        for spec in specifiers {
            if let ImportDeclarationSpecifier::ImportSpecifier(named) = spec {
                if named.imported.name().as_str() == CHILDREN_IMPORT {
                    names.insert(named.local.name.to_string());
                }
            }
        }
    }
    names
}

struct Analyzer<'a> {
    children_names: HashSet<String>,
    severity: Severity,
    diagnostics: Vec<Diagnostic>,
    #[allow(dead_code)]
    source: &'a str,
}

impl<'a> Visit<'a> for Analyzer<'a> {
    fn visit_function(&mut self, func: &Function<'a>, flags: oxc_syntax::scope::ScopeFlags) {
        if let Some(body) = &func.body {
            self.analyze_function_body(&body.statements);
        }
        walk::walk_function(self, func, flags);
    }

    fn visit_arrow_function_expression(&mut self, arrow: &ArrowFunctionExpression<'a>) {
        self.analyze_function_body(&arrow.body.statements);
        walk::walk_arrow_function_expression(self, arrow);
    }
}

impl<'a> Analyzer<'a> {
    fn push(&mut self, message: String, span: Span, help: Option<String>) {
        let mut d = match self.severity {
            Severity::Error => Diagnostic::error(message, span.start, span.end),
            Severity::Warning => Diagnostic::warning(message, span.start, span.end),
        };
        d.help = help;
        self.diagnostics.push(d);
    }

    /// Analyze one function's own body: collect its `children()` slot
    /// declarations, then walk its returned JSX to learn render order.
    fn analyze_function_body(&mut self, stmts: &[Statement<'a>]) {
        let mut slots: Vec<Slot> = Vec::new();
        for stmt in stmts {
            let Statement::VariableDeclaration(decl) = stmt else {
                continue;
            };
            for d in &decl.declarations {
                let BindingPattern::BindingIdentifier(id) = &d.id else {
                    continue;
                };
                let Some(init) = &d.init else { continue };
                let Some(deps) = self.children_call_deps(init) else {
                    continue;
                };
                slots.push(Slot {
                    name: id.name.to_string(),
                    decl_index: slots.len(),
                    decl_span: id.span,
                    deps,
                });
            }
        }

        if slots.is_empty() {
            return;
        }

        // Walk the function's returned JSX (all top-level return statements, and
        // arrow-expression bodies) collecting render order.
        let mut ctx = RenderCtx {
            slots: &slots,
            pos: 0,
            renders: Vec::new(),
            inline_inserts: Vec::new(),
        };
        for stmt in stmts {
            match stmt {
                Statement::ReturnStatement(ret) => {
                    if let Some(arg) = &ret.argument {
                        ctx.walk_expr(arg);
                    }
                }
                Statement::ExpressionStatement(es) => {
                    // Arrow with an expression body lands here as its sole stmt.
                    ctx.walk_expr(&es.expression);
                }
                _ => {}
            }
        }

        self.check_order(&slots, &ctx.renders);
        self.check_mixed(&slots, &ctx.renders, &ctx.inline_inserts);
    }

    /// Check 2 — a `children()`-resolved slot rendered (DOM order) *after* an
    /// inline element insert. The slot is resolved eagerly on the server but
    /// walked early on the client; the inline insert is resolved lazily at its
    /// template position. Mixing the two drifts hydration keys.
    fn check_mixed(
        &mut self,
        slots: &[Slot],
        renders: &[SlotRender],
        inline_inserts: &[(usize, Span)],
    ) {
        let Some(&(first_inline_pos, first_inline_span)) = inline_inserts
            .iter()
            .min_by_key(|(pos, _)| *pos)
        else {
            return;
        };
        // The first slot render that occurs after an inline element insert.
        let Some(late_slot) = renders
            .iter()
            .filter(|r| r.pos > first_inline_pos)
            .min_by_key(|r| r.pos)
        else {
            return;
        };
        let slot_name = &slots[late_slot.slot_index].name;
        self.push(
            format!(
                "hydration key order: the `children()`-resolved slot `{slot}` renders after an \
                 inline element slot. Solid resolves `children()` eagerly on the server but walks \
                 the DOM in order on the client, so mixing an eagerly-resolved slot with an \
                 inline element slot rendered before it drifts hydration keys.",
                slot = slot_name,
            ),
            first_inline_span,
            Some(format!(
                "resolve every element slot through `children()` declared in DOM order (route \
                 this inline slot through `children()` above `{slot}` too), or resolve none of \
                 them through `children()`.",
                slot = slot_name,
            )),
        );
    }

    /// If `expr` is a `children(() => …)` call whose callee is the tracked
    /// import, return the set of identifiers referenced inside it.
    fn children_call_deps(&self, expr: &Expression<'a>) -> Option<HashSet<String>> {
        let Expression::CallExpression(call) = expr else {
            return None;
        };
        let Expression::Identifier(callee) = &call.callee else {
            return None;
        };
        if !self.children_names.contains(callee.name.as_str()) {
            return None;
        }
        let mut deps = IdentCollector {
            names: HashSet::new(),
        };
        for arg in &call.arguments {
            if let Some(e) = arg.as_expression() {
                deps.visit_expression(e);
            }
        }
        Some(deps.names)
    }

    /// Check 1 — `children()` slots rendered out of declaration order.
    fn check_order(&mut self, slots: &[Slot], renders: &[SlotRender]) {
        // First render position per slot, in render (DOM) order.
        let mut seen = vec![false; slots.len()];
        let mut order: Vec<usize> = Vec::new();
        for r in renders {
            if !seen[r.slot_index] {
                seen[r.slot_index] = true;
                order.push(r.slot_index);
            }
        }
        // Find an inversion: a slot rendered before another with a smaller
        // declaration index (i.e. declared later but rendered earlier).
        for i in 0..order.len() {
            for j in (i + 1)..order.len() {
                let earlier_rendered = &slots[order[i]]; // rendered first
                let later_rendered = &slots[order[j]]; // rendered second
                if earlier_rendered.decl_index > later_rendered.decl_index {
                    // To fix, `earlier_rendered` must be declared before
                    // `later_rendered`. Skip if that's unsafe (dependency).
                    if earlier_rendered.deps.contains(&later_rendered.name) {
                        continue;
                    }
                    self.push(
                        format!(
                            "hydration key order: `{a}` renders before `{b}` in the DOM but is \
                             declared after it. Solid resolves `children()` eagerly on the server \
                             in declaration order, so this drifts hydration keys against the \
                             client's DOM-walk order.",
                            a = earlier_rendered.name,
                            b = later_rendered.name,
                        ),
                        earlier_rendered.decl_span,
                        Some(format!(
                            "declare the `children()` slots in the order they render: move \
                             `{a}` above `{b}`.",
                            a = earlier_rendered.name,
                            b = later_rendered.name,
                        )),
                    );
                    return; // one diagnostic per function is enough to act on.
                }
            }
        }
    }

}

/// Collects `IdentifierReference` names within an expression (for dep tracking).
struct IdentCollector {
    names: HashSet<String>,
}
impl<'a> Visit<'a> for IdentCollector {
    fn visit_identifier_reference(&mut self, ident: &IdentifierReference<'a>) {
        self.names.insert(ident.name.to_string());
    }
}

/// Walks a returned JSX expression tree (stopping at nested function
/// boundaries) to record slot invocations and inline element inserts in DOM
/// (source) order.
struct RenderCtx<'s> {
    slots: &'s [Slot],
    pos: usize,
    renders: Vec<SlotRender>,
    /// (pos, span) of each inline element insert.
    inline_inserts: Vec<(usize, Span)>,
}

impl<'s> RenderCtx<'s> {
    fn walk_expr<'a>(&mut self, expr: &Expression<'a>) {
        match expr {
            // Stop at nested function scopes — analyzed independently.
            Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_) => {}
            Expression::JSXElement(el) => self.walk_jsx_element(el),
            Expression::JSXFragment(frag) => self.walk_jsx_children(&frag.children),
            Expression::ParenthesizedExpression(p) => self.walk_expr(&p.expression),
            Expression::ConditionalExpression(c) => {
                self.walk_expr(&c.consequent);
                self.walk_expr(&c.alternate);
            }
            Expression::LogicalExpression(l) => {
                self.walk_expr(&l.left);
                self.walk_expr(&l.right);
            }
            _ => {}
        }
    }

    fn walk_jsx_element<'a>(&mut self, el: &JSXElement<'a>) {
        self.walk_jsx_children(&el.children);
    }

    fn walk_jsx_children<'a>(&mut self, children: &[JSXChild<'a>]) {
        for child in children {
            match child {
                JSXChild::Element(el) => self.walk_jsx_element(el),
                JSXChild::Fragment(frag) => self.walk_jsx_children(&frag.children),
                JSXChild::ExpressionContainer(container) => {
                    if let Some(expr) = container.expression.as_expression() {
                        self.visit_container_expr(expr);
                    }
                }
                JSXChild::Text(_) | JSXChild::Spread(_) => {}
            }
        }
    }

    /// An expression appearing as a JSX child (`{ … }`).
    fn visit_container_expr<'a>(&mut self, expr: &Expression<'a>) {
        // A slot invocation `NAME()`?
        if let Some(slot_index) = self.slot_call_index(expr) {
            let pos = self.pos;
            self.pos += 1;
            self.renders.push(SlotRender { slot_index, pos });
            return;
        }
        // Recurse into JSX / conditionals to find deeper slot renders, and
        // record inline element inserts.
        match expr {
            Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_) => {}
            Expression::JSXElement(el) => self.walk_jsx_element(el),
            Expression::JSXFragment(frag) => self.walk_jsx_children(&frag.children),
            Expression::ParenthesizedExpression(p) => self.visit_container_expr(&p.expression),
            Expression::ConditionalExpression(c) => {
                self.visit_container_expr(&c.consequent);
                self.visit_container_expr(&c.alternate);
            }
            Expression::LogicalExpression(l) => {
                self.visit_container_expr(&l.right);
            }
            _ if is_potential_element(expr) => {
                let pos = self.pos;
                self.pos += 1;
                self.inline_inserts.push((pos, expr.span()));
            }
            _ => {}
        }
    }

    /// If `expr` is `NAME()` where NAME is a tracked slot, return its index.
    fn slot_call_index<'a>(&self, expr: &Expression<'a>) -> Option<usize> {
        let Expression::CallExpression(call) = expr else {
            return None;
        };
        if !call.arguments.is_empty() {
            return None;
        }
        let Expression::Identifier(callee) = &call.callee else {
            return None;
        };
        self.slots.iter().position(|s| s.name == callee.name.as_str())
    }
}

/// Whether an inline JSX child expression is plausibly an element-valued slot
/// (as opposed to an obvious primitive). Conservative: member/identifier/JSX
/// count; literals and string-producing expressions do not; calls are excluded
/// to limit false positives.
fn is_potential_element(expr: &Expression) -> bool {
    matches!(
        expr,
        Expression::Identifier(_)
            | Expression::StaticMemberExpression(_)
            | Expression::ComputedMemberExpression(_)
            | Expression::JSXElement(_)
            | Expression::JSXFragment(_)
    )
}
