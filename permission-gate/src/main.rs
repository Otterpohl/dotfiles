use clap::{Parser, Subcommand};
use permission_gate::*;

#[derive(Parser)]
#[command(name = "permission-gate", about = "Permission gate for opencode")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Check if a tool action is allowed
    Check {
        tool: String,
        args: String,
    },
    /// Remember a permission decision
    Remember {
        tool: String,
        pattern: String,
        action: String,
    },
    /// Forget a remembered decision
    Forget {
        tool: String,
        pattern: String,
    },
    /// List all remembered decisions and config rules
    List,
    /// List or clear pending (unresolved) permission calls
    Pending {
        #[command(subcommand)]
        action: Option<PendingAction>,
    },
    /// Review a pending entry by index and optionally resolve it
    Review {
        index: usize,
        resolve: Option<String>,
    },
}

#[derive(Subcommand)]
enum PendingAction {
    /// List all pending entries (default)
    List,
    /// Clear all pending entries
    Clear,
}

fn main() {
    let cli = Cli::parse();

    match cli.command {
        Commands::Check { tool, args } => cmd_check(&tool, &args),
        Commands::Remember { tool, pattern, action } => cmd_remember(&tool, &pattern, &action),
        Commands::Forget { tool, pattern } => cmd_forget(&tool, &pattern),
        Commands::List => cmd_list(),
        Commands::Pending { action } => cmd_pending(action),
        Commands::Review { index, resolve } => cmd_review(index, resolve),
    }
}

fn cmd_check(tool: &str, args_json: &str) {
    let config = load_config_from(&default_config_dir());
    let rules = config.rule.unwrap_or_default();
    let decisions = load_decisions_from(&default_data_dir());
    let formatted = fmt_args(tool, args_json);

    let result = check_tool(&rules, &decisions.entries, tool, &formatted);

    match result {
        CheckResult::Allow => println!("allow"),
        CheckResult::Deny => println!("deny"),
        CheckResult::Ask => {
            let mut pending = load_pending_from(&default_data_dir());
            pending.entries.push(PendingEntry {
                tool: tool.to_string(),
                args: formatted,
                time: now_secs(),
            });
            save_pending_to(&default_data_dir(), &pending);
            println!("ask");
        }
    }
}

fn cmd_remember(tool: &str, pattern: &str, action: &str) {
    if action != "allow" && action != "deny" {
        eprintln!("Action must be 'allow' or 'deny'");
        std::process::exit(1);
    }

    let mut decisions = load_decisions_from(&default_data_dir());
    decisions.entries.push(Decision {
        tool: tool.to_string(),
        pattern: pattern.to_string(),
        action: action.to_string(),
        time: now_secs(),
    });

    save_decisions_to(&default_data_dir(), &decisions);
    println!("remembered: {} {} -> {}", tool, pattern, action);
}

fn cmd_forget(tool: &str, pattern: &str) {
    let mut decisions = load_decisions_from(&default_data_dir());
    decisions.entries.retain(|d| d.tool != tool || d.pattern != pattern);
    save_decisions_to(&default_data_dir(), &decisions);
    println!("forgotten: {} {}", tool, pattern);
}

fn cmd_list() {
    let decisions = load_decisions_from(&default_data_dir());
    if decisions.entries.is_empty() {
        println!("no remembered decisions");
    } else {
        for d in &decisions.entries {
            println!("{} {} {} {}", d.tool, d.pattern, d.action, d.time);
        }
    }

    let config = load_config_from(&default_config_dir());
    if let Some(rules) = config.rule {
        if !rules.is_empty() {
            println!("--- config rules ---");
            for r in &rules {
                println!("{} {} {}", r.tool, r.pattern, r.action);
            }
        }
    }
}

fn cmd_pending(action: Option<PendingAction>) {
    match action {
        Some(PendingAction::Clear) => {
            save_pending_to(&default_data_dir(), &Pending::default());
            println!("pending cleared");
        }
        Some(PendingAction::List) | None => {
            let pending = load_pending_from(&default_data_dir());
            if pending.entries.is_empty() {
                println!("no pending entries");
                return;
            }
            for (i, e) in pending.entries.iter().enumerate() {
                println!("[{}] {} {} {}", i, e.tool, e.args, e.time);
            }
        }
    }
}

fn cmd_review(index: usize, resolve: Option<String>) {
    let mut pending = load_pending_from(&default_data_dir());

    if index >= pending.entries.len() {
        eprintln!(
            "Index {} out of range ({} pending entries)",
            index,
            pending.entries.len()
        );
        std::process::exit(1);
    }

    let entry = pending.entries[index].clone();

    match resolve.as_deref() {
        Some("allow") | Some("deny") => {
            let action = resolve.as_ref().unwrap();
            let mut decisions = load_decisions_from(&default_data_dir());
            decisions.entries.push(Decision {
                tool: entry.tool.clone(),
                pattern: entry.args.clone(),
                action: action.clone(),
                time: now_secs(),
            });
            save_decisions_to(&default_data_dir(), &decisions);

            pending.entries.remove(index);
            save_pending_to(&default_data_dir(), &pending);

            println!("resolved [{}] {} {} -> {}", index, entry.tool, entry.args, action);
        }
        _ => {
            println!("[{}] {} {}", index, entry.tool, entry.args);
            println!(
                "  resolve with: permission-gate review {} <allow|deny>",
                index
            );
        }
    }
}