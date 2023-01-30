export ZSH="$HOME/.oh-my-zsh"

ZSH_THEME="otterpohl"

plugins=(
    git
    zsh-autosuggestions
    1password
)

source $ZSH/oh-my-zsh.sh
source <(kubectl completion zsh)

# ls replacement stuff
alias l='exa'
alias la='exa -a'
alias ll='exa -lah'
alias ls='exa --color=auto'
alias lt='exa --tree'

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

# firefox stuff
alias f='firefox'

# Kubernetes stuff
alias k='kubectl'

# windows equivalents please
alias cls='clear'