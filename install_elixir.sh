#!/bin/bash
set -e

echo "Installing asdf via Homebrew..."
brew install asdf

echo "Adding asdf to shell..."
SHELL_NAME=$(basename "$SHELL")

case "$SHELL_NAME" in
  bash)
    SHELL_RC="$HOME/.bashrc"
    echo '. "$(brew --prefix asdf)/libexec/asdf.sh"' >> "$SHELL_RC"
    ;;
  zsh)
    SHELL_RC="$HOME/.zshrc"
    echo '. "$(brew --prefix asdf)/libexec/asdf.sh"' >> "$SHELL_RC"
    ;;
  fish)
    SHELL_RC="$HOME/.config/fish/config.fish"
    echo 'source (brew --prefix asdf)/libexec/asdf.fish' >> "$SHELL_RC"
    ;;
  *)
    echo "Unknown shell: $SHELL_NAME. Add asdf manually to your shell config."
    ;;
esac

echo "Loading asdf for current session..."
# Try multiple known paths for different Homebrew/asdf versions
ASDF_SH=""
for candidate in \
  "$(brew --prefix asdf 2>/dev/null)/libexec/asdf.sh" \
  "$(brew --prefix)/opt/asdf/libexec/asdf.sh" \
  "$(brew --prefix)/share/asdf-vm/asdf.sh"; do
  if [ -f "$candidate" ]; then
    ASDF_SH="$candidate"
    break
  fi
done

# Last resort: search under Homebrew prefix
if [ -z "$ASDF_SH" ]; then
  ASDF_SH="$(find "$(brew --prefix)" -name "asdf.sh" 2>/dev/null | head -1)"
fi

if [ -f "$ASDF_SH" ]; then
  echo "  Found asdf at: $ASDF_SH"
  . "$ASDF_SH"
else
  echo "Error: could not locate asdf.sh. Try: brew reinstall asdf"
  exit 1
fi

echo "Installing Elixir plugin for asdf..."
asdf plugin add elixir https://github.com/asdf-vm/asdf-elixir.git

echo "Installing Erlang plugin (required by Elixir)..."
asdf plugin add erlang https://github.com/asdf-vm/asdf-erlang.git

echo "Installing latest Erlang..."
asdf install erlang latest
asdf global erlang latest

echo "Installing latest Elixir..."
asdf install elixir latest
asdf global elixir latest

echo "Verifying installation..."
elixir --version

echo "Done! Restart your terminal or run: source $SHELL_RC"


# If there are error for asdf.sh not found, running following commands
# # Check if asdf is already in PATH directly
# which asdf

# # If found, just run these manually:
# asdf plugin add erlang https://github.com/asdf-vm/asdf-erlang.git
# asdf plugin add elixir https://github.com/asdf-vm/asdf-elixir.git
# asdf install erlang latest
# asdf global erlang latest
# asdf install elixir latest
# asdf global elixir latest