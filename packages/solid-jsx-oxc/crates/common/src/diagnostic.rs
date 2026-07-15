//! Lightweight diagnostic type surfaced by the transform (distinct from the
//! standalone linter crate's richer `Diagnostic`). These are collected during
//! the compile-time analysis passes (e.g. the hydration slot-order check) and
//! threaded out through the NAPI boundary so the Vite/Rolldown/Bun plugins can
//! fail the build (or warn).

/// Severity of a transform-time diagnostic.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Severity {
    Error,
    Warning,
}

impl Severity {
    /// Lowercase string used across the NAPI boundary (`"error"` / `"warning"`).
    pub fn as_str(self) -> &'static str {
        match self {
            Severity::Error => "error",
            Severity::Warning => "warning",
        }
    }
}

/// A single transform-time diagnostic anchored to a source span.
#[derive(Debug, Clone)]
pub struct Diagnostic {
    pub severity: Severity,
    pub message: String,
    pub help: Option<String>,
    /// Byte offset of the span start in the source text.
    pub start: u32,
    /// Byte offset of the span end in the source text.
    pub end: u32,
}

impl Diagnostic {
    pub fn error(message: impl Into<String>, start: u32, end: u32) -> Self {
        Self {
            severity: Severity::Error,
            message: message.into(),
            help: None,
            start,
            end,
        }
    }

    pub fn warning(message: impl Into<String>, start: u32, end: u32) -> Self {
        Self {
            severity: Severity::Warning,
            message: message.into(),
            help: None,
            start,
            end,
        }
    }

    pub fn with_help(mut self, help: impl Into<String>) -> Self {
        self.help = Some(help.into());
        self
    }
}

/// Controls the hydration slot-order analysis pass.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum HydrationOrderMode {
    /// Emit a fatal `Error` diagnostic (default).
    #[default]
    Error,
    /// Emit a non-fatal `Warning` diagnostic.
    Warn,
    /// Disable the check entirely.
    Off,
}

impl HydrationOrderMode {
    /// Parse the mode from the NAPI string option (`"error"|"warn"|"off"`).
    /// Unknown/absent values fall back to the default (`Error`).
    pub fn from_option(s: Option<&str>) -> Self {
        match s {
            Some("warn") | Some("warning") => HydrationOrderMode::Warn,
            Some("off") | Some("none") | Some("false") => HydrationOrderMode::Off,
            _ => HydrationOrderMode::Error,
        }
    }

    /// The diagnostic severity this mode emits, if any.
    pub fn severity(self) -> Option<Severity> {
        match self {
            HydrationOrderMode::Error => Some(Severity::Error),
            HydrationOrderMode::Warn => Some(Severity::Warning),
            HydrationOrderMode::Off => None,
        }
    }
}
