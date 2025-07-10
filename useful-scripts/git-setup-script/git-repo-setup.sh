#!/usr/bin/env bash

# === File: clone-and-configure.sh ===
# Purpose: Clones repos using custom hosts and configures Git identity per repo

# === VARIABLES ===
PERSONAL_NAME="Anubhav Kumar"
PERSONAL_EMAIL="anubhav.p.kumar@gmail.com"

WORK_NAME="Anubhav Kumar"
WORK_EMAIL="anubhav@travelstop.com"

WORK_BASE_PATH="/Users/anubhavkumar/work/repos"
PERSONAL_BASE_PATH="/Users/anubhavkumar/personal-codes"

# === STEP 1: Clone Repositories ===
echo "📦 Cloning personal repo"
cd $PERSONAL_BASE_PATH
git clone git@github.com-personal:anubhav-kumar/super-codes.git
echo "🔧 Setting local Git config for personal repo..."
cd super-codes || exit
git config user.name "$PERSONAL_NAME"
git config user.email "$PERSONAL_EMAIL"

# cd $WORK_BASE_PATH
# echo "📦 Cloning work repo"
# git clone git@github.com-work:WhiteLabs/Travelstop.git

# # === STEP 2: Configure Git Per Repo ===

# echo "🔧 Setting local Git config for work repo..."
# cd Travelstop || exit

# git config user.name "$WORK_NAME"
# git config user.email "$WORK_EMAIL"

cd ..

echo -e "✅ Repositories cloned and configured successfully."
