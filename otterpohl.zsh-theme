PROMPT=$'%{$fg_bold[white]%}%*%{$reset_color%} %{$fg[red]%}%{$(git_prompt_info)%}[%{$fg_bold[white]%}%~%{$reset_color%}%{$fg[red]%}]
>%{$reset_color%} '

ZSH_THEME_GIT_PROMPT_PREFIX="%{$fg[red]%}[%{$fg_bold[white]%}"
ZSH_THEME_GIT_PROMPT_SUFFIX="%{$reset_color%}%{$fg[red]%}] "
ZSH_THEME_GIT_PROMPT_DIRTY=" %{$fg[red]%}⚡%{$reset_color%}"
