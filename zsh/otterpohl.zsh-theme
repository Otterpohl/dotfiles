# otterpohl — minimal oh-my-zsh theme
# Managed by ~/dotfiles — edit there, not here

# Prompt symbol: green on success, red on failure
PROMPT="%(?:%{$fg_bold[green]%}%1{➜%} :%{$fg_bold[red]%}%1{➜%} ) "

# Current directory (last component), cyan
PROMPT+="%{$fg[cyan]%}%c%{$reset_color%}"

# Git branch + dirty marker
PROMPT+=' $(git_prompt_info)'

# Active mise-managed tool versions (compact), yellow — only if mise is on PATH
command -v mise &>/dev/null && {
  _otter_mise() {
    local v
    v=$(mise current 2>/dev/null) || return
    [[ -n "$v" ]] && printf " %%{$fg[yellow]%%}[%s]%%{$reset_color%%}" "$v"
  }
  PROMPT+=' $(_otter_mise)'
}

# Git prompt formatting
ZSH_THEME_GIT_PROMPT_PREFIX="%{$fg_bold[blue]%}git:(%{$fg[red]%}"
ZSH_THEME_GIT_PROMPT_SUFFIX="%{$reset_color%} "
ZSH_THEME_GIT_PROMPT_DIRTY="%{$fg[blue]%}) %{$fg[yellow]%}%1{✗%}"
ZSH_THEME_GIT_PROMPT_CLEAN="%{$fg[blue]%})"