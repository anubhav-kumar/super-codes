#!/bin/bash
set -e

echo "=== Uninstalling Elixir & asdf ==="

# Load asdf if available
if [ -f "$(brew --prefix asdf 2>/dev/null)/libexec/asdf.sh" ]; then
  . "$(brew --prefix asdf)/libexec/asdf.sh"
fi

# Remove all asdf plugins and their installed versions
if command -v asdf &>/dev/null; then
  echo "Removing asdf plugins and installed versions..."
  for plugin in $(asdf plugin list 2>/dev/null); do
    echo "  Removing plugin: $plugin"
    asdf plugin remove "$plugin"
  done
fi

# Uninstall asdf via Homebrew
if brew list asdf &>/dev/null; then
  echo "Uninstalling asdf via Homebrew..."
  brew uninstall asdf
fi

# Remove asdf data directory (~/.asdf)
if [ -d "$HOME/.asdf" ]; then
  echo "Removing ~/.asdf directory..."
  rm -rf "$HOME/.asdf"
fi

# Remove asdf lines from shell config files
echo "Cleaning shell config files..."
SHELL_CONFIGS=(
  "$HOME/.bashrc"
  "$HOME/.bash_profile"
  "$HOME/.zshrc"
  "$HOME/.zprofile"
  "$HOME/.config/fish/config.fish"
  "$HOME/.profile"
)

for config in "${SHELL_CONFIGS[@]}"; do
  if [ -f "$config" ]; then
    echo "  Cleaning $config..."
    # Remove lines containing asdf references
    sed -i.bak '/asdf/d' "$config"
    rm -f "${config}.bak"
  fi
done

# Remove any leftover Elixir/Erlang mix artifacts
echo "Removing Mix and Hex artifacts..."
rm -rf "$HOME/.mix"
rm -rf "$HOME/.hex"

# Remove IEx history
rm -f "$HOME/.erlang-history"
rm -rf "$HOME/.erlang_ls"

# Remove Rebar (Erlang build tool)
rm -rf "$HOME/.cache/rebar3"
rm -rf "$HOME/.config/rebar3"

echo ""
echo "Done! Restart your terminal to apply shell changes."