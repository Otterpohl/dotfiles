sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
brew install tmux

mkdir ~/.config/alacritty
cp ./alacritty.toml ~/.config/alacritty/alacritty.toml
cp .zshrc ~/.zshrc
cp otterpohl.zsh-theme ~/.oh-my-zsh/themes/otterpohl.zsh-theme
cp ~/.tmux.conf .