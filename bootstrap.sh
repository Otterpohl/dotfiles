#!/usr/bin/env bash
# bootstrap — idempotent system setup
# Usage: bash setup.sh
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# helpers
# ═══════════════════════════════════════════════════════════════
info()  { printf "\033[1;34m·\033[0m %s\n" "$*"; }
ok()    { printf "\033[1;32m✓\033[0m %s\n" "$*"; }
skip()  { printf "\033[1;33m─\033[0m %s\n" "$*"; }

HOME="${HOME:-$HOME}"
CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/bootstrap"
mkdir -p "$CACHE_DIR"

BOOTSTRAP_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── paths ──
ALACRITTY_CFG="$HOME/.config/alacritty/alacritty.toml"
ZSHRC="$HOME/.zshrc"
OC_DIR="$HOME/.config/opencode"
OC_PLUGINS_DIR="$OC_DIR/plugins"
CARGO_BIN="$HOME/.cargo/bin"
LOCAL_BIN="$HOME/.local/bin"
BUN_DIR="$HOME/.bun"

# ═══════════════════════════════════════════════════════════════
# 1. mise — tool version manager
# ═══════════════════════════════════════════════════════════════
section_mise() {
  info "[mise] checking…"
  if ! command -v mise &>/dev/null; then
    info "  installing mise…"
    curl -fsSL https://mise.run | bash
    eval "$("$LOCAL_BIN/mise" activate bash)"
    ok "  mise installed"
  fi

  # Ensure mise config is symlinked
  local mise_src="$BOOTSTRAP_DIR/mise.toml"
  local mise_dst="$HOME/.config/mise/config.toml"
  mkdir -p "$HOME/.config/mise"
  cp "$mise_src" "$mise_dst"
  ok "  mise config synced"

  info "  installing tools (rust, bun)…"
  mise install 2>&1 | while IFS= read -r line; do echo "    $line"; done
  ok "  tools installed"

  # Activate mise for this shell session
  eval "$(mise activate bash)"
}

# ═══════════════════════════════════════════════════════════════
# 2. homebrew — package manager (Linux)
# ═══════════════════════════════════════════════════════════════
BREW_PREFIX="/home/linuxbrew/.linuxbrew"
BREK_BIN="$BREW_PREFIX/bin"
BREWFILE="$BOOTSTRAP_DIR/Brewfile"

section_brew() {
  info "[brew] checking…"
  if ! command -v brew &>/dev/null; then
    if [[ ! -x "$BREK_BIN/brew" ]]; then
      info "  installing Homebrew for Linux (may need sudo)…"
      NONINTERACTIVE=1 bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" || \
        sudo NONINTERACTIVE=1 bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
      ok "  brew installed"
    fi
    eval "$("$BREK_BIN/brew" shellenv)"
  else
    eval "$(brew shellenv)"
  fi

  if [[ -f "$BREWFILE" ]]; then
    info "  running brew bundle…"
    brew bundle --file="$BREWFILE" 2>&1 | tail -n +2 || true
    ok "  brew bundle done"
  fi
}

# ═══════════════════════════════════════════════════════════════
# 3. alacritty — terminal emulator
# ═══════════════════════════════════════════════════════════════
section_alacritty() {
  info "[alacritty] configuring…"
  mkdir -p "$(dirname "$ALACRITTY_CFG")"
  cat > "$ALACRITTY_CFG" << 'ALACRITTY'
# Managed by ~/.config/bootstrap/setup.sh — edit there, not here
[env]
TERM = "xterm-256color"

[terminal.shell]
program = "/home/otterpohl/.local/bin/herdr"

[keyboard]
bindings = [
  { key = "V", mods = "Control", action = "Paste" },
]
ALACRITTY
  ok "  alacritty config written"
}

# ═══════════════════════════════════════════════════════════════
# 4. zsh — shell config
# ═══════════════════════════════════════════════════════════════
section_zsh() {
  info "[zsh] configuring…"
  cat > "$ZSHRC" << ZSHRC
# Managed by ~/.config/bootstrap/setup.sh — edit there, not here
# bootstrap: do not edit above this line
# ── oh-my-zsh ──
export ZSH="\$HOME/.oh-my-zsh"
ZSH_THEME="otterpohl"
plugins=(git 1password)
source \$ZSH/oh-my-zsh.sh

[[ -f /usr/share/zsh/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh ]] && source /usr/share/zsh/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh
[[ -f /usr/share/zsh/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh ]] && source /usr/share/zsh/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh

# ── mise ──
eval "\$("$LOCAL_BIN/mise" activate zsh)" 2>/dev/null || true

# ── PATH ──
export PATH="\$HOME/.cargo/bin:\$HOME/.local/bin:\$HOME/.opencode/bin:\$HOME/.bun/bin:/home/linuxbrew/.linuxbrew/bin:\$PATH"

# ── bun completions ──
[[ -s "\$HOME/.bun/_bun" ]] && source "\$HOME/.bun/_bun"

# ── aliases ──
alias l='eza'
alias la='eza -a'
alias ll='eza -lah'
alias ls='eza --color=auto'
alias lt='eza --tree'
alias c='cargo'
alias cc='cargo check'
alias ct='cargo test'
alias cr='cargo run'
alias crr='cargo run --release'
alias g='git'
alias gs='git status'
alias gc='git commit'
alias k='kubectl'
alias cls='clear'
ZSHRC
  ok "  .zshrc written"
}

# ═══════════════════════════════════════════════════════════════
# 5. herdr — terminal multiplexer
# ═══════════════════════════════════════════════════════════════
section_herdr() {
  info "[herdr] installing via mise…"
  mise install herdr 2>&1 | while IFS= read -r line; do echo "    $line"; done
  # Symlink into ~/.local/bin so alacritty (which doesn't go through mise shims) can find it
  mkdir -p "$LOCAL_BIN"
  local herdr_bin
  herdr_bin="$(mise which herdr 2>/dev/null)"
  if [[ -n "$herdr_bin" ]]; then
    ln -sf "$herdr_bin" "$LOCAL_BIN/herdr"
  fi
  ok "  herdr installed"
}



# ═══════════════════════════════════════════════════════════════
# 6. opencode — AI coding agent CLI
# ═══════════════════════════════════════════════════════════════
section_opencode_configs() {
  info "[opencode] writing configs…"
  mkdir -p "$OC_DIR" "$OC_PLUGINS_DIR" "$OC_DIR/commands"

  # Global config — require permission for shell commands
  mkdir -p "$HOME/.opencode"
  if [[ ! -f "$HOME/.opencode/opencode.json" ]]; then
    cat > "$HOME/.opencode/opencode.json" << 'OCGLOBAL'
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "bash": "ask"
  }
}
OCGLOBAL
    ok "  global config written"
  else
    skip "  global config exists (skipped)"
  fi

  # AGENTS.md
  cat > "$OC_DIR/AGENTS.md" << 'AGENTS'
# Global Instructions

## Communication
- Be concise. Short answers are preferred.
- Explain what you're doing and why before running commands.
- Use bullet points for multiple items.

## Code
- Prefer simple, readable code over clever/optimized.
- Follow existing patterns in the project.
- Keep functions small and focused.
- Use descriptive names for variables and functions.

## Workflow
- Run lint/type checks after making changes.
- Verify changes with tests before declaring done.
- Ask clarifying questions when requirements are ambiguous.
- Prefer making plans for multi-file changes before editing.

## Permissions
- Never install plugins, packages, or modify system config without asking first.
AGENTS

  # opencode.jsonc (server)
  cat > "$OC_DIR/opencode.jsonc" << 'OCJSON'
// Managed by ~/.config/bootstrap/setup.sh — edit there, not here
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "bash": "ask"
  },
  "plugin": ["./plugins/crit.ts", "@tarquinen/opencode-smart-title"]
}
OCJSON

  # stats command
  cat > "$OC_DIR/commands/stats.md" << 'CMDSTATS'
---
description: Show token usage and cost statistics
---

Current usage stats:

!`opencode stats`
CMDSTATS

  # crit integration
  if command -v crit &>/dev/null; then
    cd "$HOME" && crit install opencode 2>/dev/null || true
    ok "  crit opencode integration installed"
  fi

  # smart-title plugin
  if command -v bun &>/dev/null; then
    bun add -g @tarquinen/opencode-smart-title 2>/dev/null || true
    ok "  smart-title plugin installed"
  fi



  # tui.json (TUI)
  cat > "$OC_DIR/tui.json" << 'TUIJSON'
// Managed by ~/.config/bootstrap/setup.sh — edit there, not here
{
  "$schema": "https://opencode.ai/tui.json",
  "mouse": true,
  "keybinds": {
    "messages_first": "ctrl+g",
    "messages_last": "ctrl+alt+g",
    "model_provider_list": "none"
  },
}
TUIJSON

  ok  "  configs written"
}

# ═══════════════════════════════════════════════════════════════
# run
# ═══════════════════════════════════════════════════════════════
echo ""
echo "  ┌──────────────────────────────────────────────┐"
echo "  │  bootstrap: brew + alacritty + zsh + herdr   │"
echo "  │             + opencode                       │"
echo "  └──────────────────────────────────────────────┘"
echo ""

section_mise
section_brew
section_alacritty
section_zsh
section_herdr
section_opencode_configs

echo ""
echo "  ── done ──"
echo ""
echo "  Source the new zshrc:  source ~/.zshrc"
echo "  Start herdr:           herdr"
echo "  (or start a new terminal session)"
echo ""
