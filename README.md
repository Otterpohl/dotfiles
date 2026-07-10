# Bootstrap — System Config Reference

## Alacritty (`~/.config/alacritty/alacritty.toml`)
- Opens directly into herdr
- `Ctrl+Shift+v` — disabled (use `Ctrl+v` instead)

## Homebrew (`~/.config/bootstrap/Brewfile`)
Declarative package list. Add new tools here after `brew install`.

## Pi (`~/.pi/agent/`)
- **AGENTS.md** — global instructions (be concise, ask before installing, sync bootstrap)
- **Extensions** — custom tools and hooks via `~/.pi/agent/extensions/`
- **Packages** — installed via `pi install npm:@...`

## Mise (`~/.config/bootstrap/mise.toml`)
Declarative dev tool versions (rust, bun). Add tools here after `mise use -g`.

## Bootstrap Workflow
Whenever installing a new tool or editing a dotfile during a session, update the corresponding file under `~/.config/bootstrap/`:
- Brew packages → `Brewfile`
- Mise tools → `mise.toml`
- Dotfiles/configs → `setup.sh`
