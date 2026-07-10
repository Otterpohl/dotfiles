use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Config {
    pub rule: Option<Vec<Rule>>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Rule {
    pub tool: String,
    pub pattern: String,
    pub action: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Decision {
    pub tool: String,
    pub pattern: String,
    pub action: String,
    pub time: u64,
}

#[derive(Debug, Serialize, Deserialize, Default, Clone)]
pub struct Decisions {
    pub entries: Vec<Decision>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PendingEntry {
    pub tool: String,
    pub args: String,
    pub time: u64,
}

#[derive(Debug, Serialize, Deserialize, Default, Clone)]
pub struct Pending {
    pub entries: Vec<PendingEntry>,
}

pub fn pattern_match(pattern: &str, text: &str) -> bool {
    let re = match Regex::new(pattern) {
        Ok(r) => r,
        Err(_) => return false,
    };
    re.is_match(text)
}

pub fn check_rules<'a>(rules: &'a [Rule], tool: &str, args: &str) -> Option<&'a str> {
    let mut result: Option<&str> = None;
    for rule in rules {
        if rule.tool != "*" && rule.tool != tool {
            continue;
        }
        if pattern_match(&rule.pattern, args) {
            result = Some(&rule.action);
        }
    }
    result
}

pub fn check_decisions<'a>(decisions: &'a [Decision], tool: &str, args: &str) -> Option<&'a str> {
    let mut result: Option<&str> = None;
    for d in decisions {
        if d.tool != "*" && d.tool != tool {
            continue;
        }
        if pattern_match(&d.pattern, args) {
            result = Some(&d.action);
        }
    }
    result
}

pub fn split_command(cmd: &str) -> Vec<String> {
    cmd.split("&&")
        .flat_map(|s| s.split("||"))
        .flat_map(|s| s.split(';'))
        .flat_map(|s| s.split('|'))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

pub fn check_single(
    rules: &[Rule],
    decisions: &[Decision],
    tool: &str,
    args: &str,
) -> String {
    if let Some(action) = check_decisions(decisions, tool, args) {
        return action.to_string();
    }
    if let Some(action) = check_rules(rules, tool, args) {
        return action.to_string();
    }
    "ask".to_string()
}

pub fn check_bash_command(
    rules: &[Rule],
    decisions: &[Decision],
    command: &str,
) -> CheckResult {
    let parts = split_command(command);
    if parts.is_empty() {
        return CheckResult::Ask;
    }

    for part in &parts {
        match check_single(rules, decisions, "bash", part).as_str() {
            "allow" => {}
            "deny" => return CheckResult::Deny,
            _ => return CheckResult::Ask,
        }
    }

    CheckResult::Allow
}

#[derive(Debug, PartialEq)]
pub enum CheckResult {
    Allow,
    Deny,
    Ask,
}

pub fn check_tool(
    rules: &[Rule],
    decisions: &[Decision],
    tool: &str,
    formatted: &str,
) -> CheckResult {
    if tool == "bash" {
        return check_bash_command(rules, decisions, formatted);
    }

    if let Some(action) = check_decisions(decisions, tool, formatted) {
        return match action {
            "allow" => CheckResult::Allow,
            "deny" => CheckResult::Deny,
            _ => CheckResult::Ask,
        };
    }

    if let Some(action) = check_rules(rules, tool, formatted) {
        return match action {
            "allow" => CheckResult::Allow,
            "deny" => CheckResult::Deny,
            _ => CheckResult::Ask,
        };
    }

    CheckResult::Ask
}

pub fn fmt_args(tool: &str, args_json: &str) -> String {
    match tool {
        "bash" => {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(args_json) {
                if let Some(cmd) = v.get("command").and_then(|c| c.as_str()) {
                    return cmd.to_string();
                }
            }
            args_json.to_string()
        }
        "webfetch" => {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(args_json) {
                if let Some(url) = v.get("url").and_then(|u| u.as_str()) {
                    return url.to_string();
                }
            }
            args_json.to_string()
        }
        "read" | "edit" | "write" | "glob" | "grep" => {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(args_json) {
                for key in &["filePath", "path", "pattern"] {
                    if let Some(val) = v.get(*key).and_then(|v| v.as_str()) {
                        return val.to_string();
                    }
                }
            }
            args_json.to_string()
        }
        _ => args_json.to_string(),
    }
}

pub fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

pub fn load_config_from(dir: &Path) -> Config {
    let path = dir.join("rules.json");
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return Config { rule: None },
    };
    serde_json::from_str(&content).unwrap_or(Config { rule: None })
}

pub fn load_decisions_from(dir: &Path) -> Decisions {
    let path = dir.join("decisions.json");
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return Decisions::default(),
    };
    serde_json::from_str(&content).unwrap_or(Decisions::default())
}

pub fn save_decisions_to(dir: &Path, decisions: &Decisions) {
    fs::create_dir_all(dir).ok();
    let path = dir.join("decisions.json");
    if let Ok(json) = serde_json::to_string_pretty(decisions) {
        fs::write(path, json).ok();
    }
}

pub fn load_pending_from(dir: &Path) -> Pending {
    let path = dir.join("pending.json");
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return Pending::default(),
    };
    serde_json::from_str(&content).unwrap_or(Pending::default())
}

pub fn save_pending_to(dir: &Path, pending: &Pending) {
    fs::create_dir_all(dir).ok();
    let path = dir.join("pending.json");
    if let Ok(json) = serde_json::to_string_pretty(pending) {
        fs::write(path, json).ok();
    }
}

pub fn default_config_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("~/.config"))
        .join("permission-gate")
}

pub fn default_data_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("~/.local/share"))
        .join("permission-gate")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn rule(tool: &str, pattern: &str, action: &str) -> Rule {
        Rule {
            tool: tool.to_string(),
            pattern: pattern.to_string(),
            action: action.to_string(),
        }
    }

    fn decision(tool: &str, pattern: &str, action: &str) -> Decision {
        Decision {
            tool: tool.to_string(),
            pattern: pattern.to_string(),
            action: action.to_string(),
            time: 0,
        }
    }

    // ── pattern_match ──

    #[test]
    fn test_pattern_match_simple_prefix() {
        assert!(pattern_match("^echo ", "echo hello"));
        assert!(!pattern_match("^echo ", "ls -la"));
    }

    #[test]
    fn test_pattern_match_anchor_full_string() {
        assert!(pattern_match("^git status$", "git status"));
        assert!(!pattern_match("^git status$", "git status --porcelain"));
    }

    #[test]
    fn test_pattern_match_url() {
        assert!(pattern_match("^https://opencode\\.ai/", "https://opencode.ai/docs"));
        assert!(!pattern_match("^https://opencode\\.ai/", "https://example.com"));
    }

    #[test]
    fn test_pattern_match_invalid_regex() {
        assert!(!pattern_match("[invalid", "anything"));
    }

    #[test]
    fn test_pattern_match_wildcard_regex() {
        assert!(pattern_match("^git .*", "git push origin main"));
        assert!(pattern_match("^git .*", "git status"));
    }

    // ── check_rules ──

    #[test]
    fn test_check_rules_last_match_wins() {
        let rules = vec![
            rule("bash", "^git ", "allow"),
            rule("bash", "^git push", "deny"),
        ];
        assert_eq!(check_rules(&rules, "bash", "git push origin"), Some("deny"));
        assert_eq!(check_rules(&rules, "bash", "git status"), Some("allow"));
    }

    #[test]
    fn test_check_rules_wildcard_tool() {
        let rules = vec![rule("*", "^echo", "allow")];
        assert_eq!(check_rules(&rules, "bash", "echo hi"), Some("allow"));
        assert_eq!(check_rules(&rules, "webfetch", "echo hi"), Some("allow"));
    }

    #[test]
    fn test_check_rules_no_match() {
        let rules = vec![rule("bash", "^echo", "allow")];
        assert_eq!(check_rules(&rules, "bash", "rm -rf /"), None);
        assert_eq!(check_rules(&rules, "webfetch", "echo hi"), None);
    }

    #[test]
    fn test_check_rules_empty() {
        assert_eq!(check_rules(&[], "bash", "echo hi"), None);
    }

    // ── check_decisions ──

    #[test]
    fn test_check_decisions_last_match_wins() {
        let decisions = vec![
            decision("bash", "^cargo", "allow"),
            decision("bash", "^cargo build", "deny"),
        ];
        assert_eq!(check_decisions(&decisions, "bash", "cargo build"), Some("deny"));
        assert_eq!(check_decisions(&decisions, "bash", "cargo test"), Some("allow"));
    }

    #[test]
    fn test_check_decisions_wildcard_tool() {
        let decisions = vec![decision("*", ".*", "allow")];
        assert_eq!(check_decisions(&decisions, "bash", "anything"), Some("allow"));
        assert_eq!(check_decisions(&decisions, "webfetch", "https://x"), Some("allow"));
    }

    #[test]
    fn test_check_decisions_no_match() {
        let decisions = vec![decision("bash", "^echo", "allow")];
        assert_eq!(check_decisions(&decisions, "bash", "rm -rf /"), None);
    }

    // ── check_single ──

    #[test]
    fn test_check_single_decisions_preferred_over_rules() {
        let rules = vec![rule("bash", "^echo", "deny")];
        let decisions = vec![decision("bash", "^echo", "allow")];
        assert_eq!(check_single(&rules, &decisions, "bash", "echo hi"), "allow");
    }

    #[test]
    fn test_check_single_falls_through_to_rules() {
        let rules = vec![rule("bash", "^echo", "allow")];
        assert_eq!(check_single(&rules, &[], "bash", "echo hi"), "allow");
    }

    #[test]
    fn test_check_single_defaults_to_ask() {
        assert_eq!(check_single(&[], &[], "bash", "rm -rf /"), "ask");
    }

    // ── split_command ──

    #[test]
    fn test_split_command_single() {
        assert_eq!(split_command("echo hello"), vec!["echo hello"]);
    }

    #[test]
    fn test_split_command_and() {
        assert_eq!(split_command("echo hi && echo bye"), vec!["echo hi", "echo bye"]);
    }

    #[test]
    fn test_split_command_or() {
        assert_eq!(split_command("echo hi || echo bye"), vec!["echo hi", "echo bye"]);
    }

    #[test]
    fn test_split_command_semicolon() {
        assert_eq!(split_command("echo hi; echo bye"), vec!["echo hi", "echo bye"]);
    }

    #[test]
    fn test_split_command_pipe() {
        assert_eq!(split_command("cat file | grep foo"), vec!["cat file", "grep foo"]);
    }

    #[test]
    fn test_split_command_mixed() {
        assert_eq!(
            split_command("echo hi && ls -la || cat file; rm -rf / | tee log"),
            vec!["echo hi", "ls -la", "cat file", "rm -rf /", "tee log"]
        );
    }

    #[test]
    fn test_split_command_empty() {
        assert!(split_command("").is_empty());
        assert!(split_command("   ").is_empty());
    }

    #[test]
    fn test_split_command_trims_whitespace() {
        assert_eq!(split_command("  echo hi   &&   ls  "), vec!["echo hi", "ls"]);
    }

    // ── check_bash_command ──

    #[test]
    fn test_check_bash_allow_single() {
        let rules = vec![rule("bash", "^echo", "allow")];
        assert_eq!(check_bash_command(&rules, &[], "echo hello"), CheckResult::Allow);
    }

    #[test]
    fn test_check_bash_allow_chain_all_safe() {
        let rules = vec![rule("bash", "^echo", "allow"), rule("bash", "^ls", "allow")];
        assert_eq!(
            check_bash_command(&rules, &[], "echo hi && ls -la"),
            CheckResult::Allow
        );
    }

    #[test]
    fn test_check_bash_chain_one_dangerous() {
        let rules = vec![rule("bash", "^echo", "allow")];
        assert_eq!(
            check_bash_command(&rules, &[], "echo hi && rm -rf /"),
            CheckResult::Ask
        );
    }

    #[test]
    fn test_check_bash_chain_deny_overrides() {
        let rules = vec![rule("bash", "^echo", "allow"), rule("bash", "^rm", "deny")];
        assert_eq!(
            check_bash_command(&rules, &[], "echo hi && rm -rf /"),
            CheckResult::Deny
        );
    }

    #[test]
    fn test_check_bash_empty_command() {
        assert_eq!(check_bash_command(&[], &[], ""), CheckResult::Ask);
    }

    #[test]
    fn test_check_bash_decision_overrides_rule_in_chain() {
        let rules = vec![rule("bash", "^rm", "deny")];
        let decisions = vec![decision("bash", "^rm", "allow")];
        assert_eq!(
            check_bash_command(&rules, &decisions, "rm -rf /tmp/test"),
            CheckResult::Allow
        );
    }

    // ── check_tool ──

    #[test]
    fn test_check_tool_bash() {
        let rules = vec![rule("bash", "^echo", "allow")];
        assert_eq!(check_tool(&rules, &[], "bash", "echo hi"), CheckResult::Allow);
    }

    #[test]
    fn test_check_tool_webfetch() {
        let rules = vec![rule("webfetch", "^https://safe", "allow")];
        assert_eq!(check_tool(&rules, &[], "webfetch", "https://safe.com"), CheckResult::Allow);
        assert_eq!(check_tool(&rules, &[], "webfetch", "https://evil.com"), CheckResult::Ask);
    }

    #[test]
    fn test_check_tool_deny() {
        let rules = vec![rule("webfetch", "^https://evil", "deny")];
        assert_eq!(check_tool(&rules, &[], "webfetch", "https://evil.com"), CheckResult::Deny);
    }

    #[test]
    fn test_check_tool_no_rules_asks() {
        assert_eq!(check_tool(&[], &[], "bash", "echo hi"), CheckResult::Ask);
        assert_eq!(check_tool(&[], &[], "webfetch", "https://x"), CheckResult::Ask);
    }

    // ── fmt_args ──

    #[test]
    fn test_fmt_args_bash() {
        assert_eq!(fmt_args("bash", r#"{"command":"echo hello"}"#), "echo hello");
    }

    #[test]
    fn test_fmt_args_bash_no_command_key() {
        assert_eq!(fmt_args("bash", r#"{"foo":"bar"}"#), r#"{"foo":"bar"}"#);
    }

    #[test]
    fn test_fmt_args_bash_invalid_json() {
        assert_eq!(fmt_args("bash", "not json"), "not json");
    }

    #[test]
    fn test_fmt_args_webfetch() {
        assert_eq!(
            fmt_args("webfetch", r#"{"url":"https://example.com"}"#),
            "https://example.com"
        );
    }

    #[test]
    fn test_fmt_args_webfetch_no_url() {
        assert_eq!(fmt_args("webfetch", r#"{"foo":"bar"}"#), r#"{"foo":"bar"}"#);
    }

    #[test]
    fn test_fmt_args_file_tools() {
        assert_eq!(
            fmt_args("read", r#"{"filePath":"/etc/passwd"}"#),
            "/etc/passwd"
        );
        assert_eq!(
            fmt_args("glob", r#"{"path":"src/*"}"#),
            "src/*"
        );
        assert_eq!(
            fmt_args("grep", r#"{"pattern":"foo.*"}"#),
            "foo.*"
        );
    }

    #[test]
    fn test_fmt_args_unknown_tool() {
        assert_eq!(fmt_args("custom", r#"{"x":1}"#), r#"{"x":1}"#);
    }

    // ── file I/O round trips ──

    fn tmp() -> TempDir {
        TempDir::new().unwrap()
    }

    #[test]
    fn test_load_config_empty() {
        let dir = tmp();
        let config = load_config_from(dir.path());
        assert!(config.rule.is_none());
    }

    #[test]
    fn test_save_load_config() {
        let dir = tmp();
        let config = Config {
            rule: Some(vec![rule("bash", "^echo", "allow")]),
        };
        let json = serde_json::to_string_pretty(&config).unwrap();
        fs::write(dir.path().join("rules.json"), json).unwrap();

        let loaded = load_config_from(dir.path());
        assert_eq!(loaded.rule.as_ref().unwrap().len(), 1);
        assert_eq!(loaded.rule.as_ref().unwrap()[0].pattern, "^echo");
    }

    #[test]
    fn test_load_config_invalid_json() {
        let dir = tmp();
        fs::write(dir.path().join("rules.json"), "not json").unwrap();
        let config = load_config_from(dir.path());
        assert!(config.rule.is_none());
    }

    #[test]
    fn test_save_load_decisions() {
        let dir = tmp();
        let decisions = Decisions {
            entries: vec![decision("bash", "^echo", "allow")],
        };
        save_decisions_to(dir.path(), &decisions);

        let loaded = load_decisions_from(dir.path());
        assert_eq!(loaded.entries.len(), 1);
        assert_eq!(loaded.entries[0].pattern, "^echo");
        assert_eq!(loaded.entries[0].action, "allow");
    }

    #[test]
    fn test_load_decisions_empty() {
        let dir = tmp();
        let loaded = load_decisions_from(dir.path());
        assert!(loaded.entries.is_empty());
    }

    #[test]
    fn test_save_load_pending() {
        let dir = tmp();
        let pending = Pending {
            entries: vec![PendingEntry {
                tool: "bash".to_string(),
                args: "rm -rf /".to_string(),
                time: 12345,
            }],
        };
        save_pending_to(dir.path(), &pending);

        let loaded = load_pending_from(dir.path());
        assert_eq!(loaded.entries.len(), 1);
        assert_eq!(loaded.entries[0].args, "rm -rf /");
        assert_eq!(loaded.entries[0].time, 12345);
    }

    #[test]
    fn test_load_pending_empty() {
        let dir = tmp();
        let loaded = load_pending_from(dir.path());
        assert!(loaded.entries.is_empty());
    }

    // ── integration: full check flow ──

    #[test]
    fn test_integration_safe_echo_chain() {
        let rules = vec![rule("bash", "^echo", "allow")];
        assert_eq!(check_tool(&rules, &[], "bash", "echo hi && echo bye"), CheckResult::Allow);
    }

    #[test]
    fn test_integration_dangerous_chain_logs_ask() {
        let rules = vec![rule("bash", "^echo", "allow")];
        let result = check_tool(&rules, &[], "bash", "echo hi && rm -rf /");
        assert_eq!(result, CheckResult::Ask);
    }

    #[test]
    fn test_integration_webfetch_allowed_url() {
        let rules = vec![rule("webfetch", "^https://opencode\\.ai/", "allow")];
        assert_eq!(
            check_tool(&rules, &[], "webfetch", "https://opencode.ai/docs"),
            CheckResult::Allow
        );
    }

    #[test]
    fn test_integration_webfetch_unknown_url() {
        let rules = vec![rule("webfetch", "^https://opencode\\.ai/", "allow")];
        assert_eq!(
            check_tool(&rules, &[], "webfetch", "https://evil.com"),
            CheckResult::Ask
        );
    }

    #[test]
    fn test_integration_decision_overrides_rule() {
        let rules = vec![rule("bash", "^rm", "deny")];
        let decisions = vec![decision("bash", "^rm", "allow")];
        assert_eq!(
            check_tool(&rules, &decisions, "bash", "rm -rf /tmp"),
            CheckResult::Allow
        );
    }

    #[test]
    fn test_integration_pipe_splits_and_checks_both() {
        let rules = vec![rule("bash", "^cat", "allow")];
        assert_eq!(
            check_tool(&rules, &[], "bash", "cat file | grep foo"),
            CheckResult::Ask
        );
    }

    #[test]
    fn test_integration_pipe_both_allowed() {
        let rules = vec![rule("bash", "^cat", "allow"), rule("bash", "^grep", "allow")];
        assert_eq!(
            check_tool(&rules, &[], "bash", "cat file | grep foo"),
            CheckResult::Allow
        );
    }

    #[test]
    fn test_integration_deny_in_chain_blocks_all() {
        let rules = vec![
            rule("bash", "^echo", "allow"),
            rule("bash", "^rm", "deny"),
        ];
        assert_eq!(
            check_tool(&rules, &[], "bash", "echo hi && rm -rf / && echo bye"),
            CheckResult::Deny
        );
    }

    #[test]
    fn test_integration_three_safe_commands() {
        let rules = vec![
            rule("bash", "^echo", "allow"),
            rule("bash", "^ls", "allow"),
            rule("bash", "^which", "allow"),
        ];
        assert_eq!(
            check_tool(&rules, &[], "bash", "echo hi && ls -la && which cargo"),
            CheckResult::Allow
        );
    }
}