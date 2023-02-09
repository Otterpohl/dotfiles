PROMPT=$'%{$fg[blue]%}[%{$fg_bold[white]%}%*%{$reset_color%}%{$fg[blue]%}] - [%{$fg_bold[white]%}%~%{$reset_color%}%{$fg[blue]%}]%{$(git_prompt_info)%}
::<>%{$reset_color%} '

ZSH_THEME_GIT_PROMPT_PREFIX=" - %{$fg[blue]%}[%{$fg_bold[white]%}"
ZSH_THEME_GIT_PROMPT_SUFFIX="%{$reset_color%}%{$fg[blue]%}]"
ZSH_THEME_GIT_PROMPT_DIRTY=" %{$fg[green]%}⚡%{$reset_color%}"
