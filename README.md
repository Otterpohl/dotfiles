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

## Janus (`~/Janus`)
Permission gate for pi tool calls. Cloned from `Otterpohl/Janus`, built with cargo, and the bundled pi extension installed via `janus install`. Rules live in `~/.config/janus/rules.json` (manage manually with `janus add`).

## Bootstrap Workflow
Whenever installing a new tool or editing a dotfile during a session, update the corresponding file under `~/.config/bootstrap/`:
- Brew packages → `Brewfile`
- Mise tools → `mise.toml`
- Janus rules → `~/.config/janus/rules.json` (then `janus add` to persist a decision)
- Dotfiles/configs → `setup.sh`
