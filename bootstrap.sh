
mkdir -p $HOME/Library/KeyBindings
echo '{
/* Remap Home / End keys to be correct */
"\UF729" = "moveToBeginningOfLine:"; /* Home */
"\UF72B" = "moveToEndOfLine:"; /* End */
"$\UF729" = "moveToBeginningOfLineAndModifySelection:"; /* Shift + Home */
"$\UF72B" = "moveToEndOfLineAndModifySelection:"; /* Shift + End */
"^\UF729" = "moveToBeginningOfDocument:"; /* Ctrl + Home */
"^\UF72B" = "moveToEndOfDocument:"; /* Ctrl + End */
"$^\UF729" = "moveToBeginningOfDocumentAndModifySelection:"; /* Shift +
Ctrl + Home */
"$^\UF72B" = "moveToEndOfDocumentAndModifySelection:"; /* Shift + Ctrl +
End */
}' > $HOME/Library/KeyBindings/DefaultKeyBinding.dict

sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
brew install tmux

mkdir ~/.config/alacritty
cp ./alacritty.toml ~/.config/alacritty/alacritty.toml
cp .zshrc ~/.zshrc
cp otterpohl.zsh-theme ~/.oh-my-zsh/themes/otterpohl.zsh-theme
cp ~/.tmux.conf .
