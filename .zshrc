export ZSH="$HOME/.oh-my-zsh"

ZSH_THEME="otterpohl"

plugins=(
    git
    1password
)

source $ZSH/oh-my-zsh.sh
source <(kubectl completion zsh)

# ls replacement stuff
alias l='eza'
alias la='eza -a'
alias ll='eza -lah'
alias ls='eza --color=auto'
alias lt='eza --tree'

# Rust cargo stuff
alias c='cargo'
alias cc='c check'
alias ct='c test'
alias cr='c run'
alias crr='c run --release'
alias cf='c flamegraph'

# git stuff
alias g='git'
alias gs='g status'
alias gc='g commit'

# Kubernetes stuff
alias k='kubectl'

# windows stuff
alias cls='clear'
