if status is-interactive
    # Commands to run in interactive sessions can go here
end

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
alias kgp='k get pods'

# windows equivalents please
alias cls='clear'

kubectl completion fish | source
