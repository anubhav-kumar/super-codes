#!/usr/bin/env bash

# === File: setup-ssh-identities.sh ===
# Purpose: Generates SSH keys, adds to agent, and writes ~/.ssh/config

# === VARIABLES ===
PERSONAL_EMAIL="anubhav.p.kumar@gmail.com"
WORK_EMAIL="anubhav@travelstop.com"

PERSONAL_KEY="$HOME/.ssh/id_ed25519_personal"
WORK_KEY="$HOME/.ssh/id_ed25519_work"

# === STEP 1: Generate SSH Keys ===
echo "\n🔧 Generating SSH keys..."
ssh-keygen -t ed25519 -C "$PERSONAL_EMAIL" -f "$PERSONAL_KEY" -N ""
ssh-keygen -t ed25519 -C "$WORK_EMAIL" -f "$WORK_KEY" -N ""

# === STEP 2: Start SSH Agent and Add Keys ===
echo "\n🚀 Starting ssh-agent and adding keys..."
eval "$(ssh-agent -s)"
ssh-add "$PERSONAL_KEY"
ssh-add "$WORK_KEY"

# === STEP 3: Configure ~/.ssh/config ===
echo "\n📄 Writing SSH config..."
mkdir -p ~/.ssh
touch ~/.ssh/config
chmod 600 ~/.ssh/config

# Append configuration
cat <<EOL >> ~/.ssh/config

# GitHub Personal
Host github.com-personal
  HostName github.com
  User git
  IdentityFile $PERSONAL_KEY

# GitHub Work
Host github.com-work
  HostName github.com
  User git
  IdentityFile $WORK_KEY
EOL

# === STEP 4: Show Public Keys ===
echo -e "\n🔑 Your Personal Public Key:\n"
cat "$PERSONAL_KEY.pub"
echo -e "\n🔑 Your Work Public Key:\n"
cat "$WORK_KEY.pub"

echo -e "\n👉 Copy and add these to your GitHub accounts under SSH keys."

