# Bootstrap — System Config Reference

## Ghostty (`~/.config/ghostty/config.ghostty`)
- Opens directly into herdr
- Built-in `catppuccin-mocha` theme (matches herdr and mill's TUI)

## Homebrew (`~/.config/bootstrap/Brewfile`)
Declarative package list. Add new tools here after `brew install`.

## Pi (`~/.pi/agent/`)
- **AGENTS.md** — global instructions (be concise, ask before installing, sync bootstrap)
- **Extensions** — custom tools and hooks via `~/.pi/agent/extensions/`
- **Packages** — installed via `pi install npm:@...`

## Mise (`~/.config/bootstrap/mise.toml`)
Declarative dev tool versions (rust, bun). Add tools here after `mise use -g`.

## Herdr (`~/.config/herdr/config.toml`)
Terminal multiplexer. Config written by `bootstrap.sh` (theme, sidebar, toasts).

## Bootstrap Workflow
Whenever installing a new tool or editing a dotfile during a session, update the corresponding file under `~/.config/bootstrap/`:
- Brew packages → `Brewfile`
- Mise tools → `mise.toml`
- Dotfiles/configs → `setup.sh`
