#!/usr/bin/env bash

# === File: create-feature-branch.sh ===
# Purpose: For each repo folder, checkout new branch, add dummy file, commit, and push

# Format: repo_name:base_branch
REPOS=(
  "super-codes:main"
  "Travelstop:master"
)

NEW_BRANCH="anubhav/git-test-branch_v2"

for ENTRY in "${REPOS[@]}"; do
  IFS=":" read -r REPO BASE_BRANCH <<< "$ENTRY"
  echo -e "\n🚀 Processing $REPO (base: $BASE_BRANCH)..."

  cd "$REPO" || { echo "❌ Failed to enter $REPO"; continue; }

  # Checkout base branch and pull latest
  git checkout "$BASE_BRANCH"
  git pull

  # Create new branch
  git checkout -b "$NEW_BRANCH"

  # Create a dummy file
  echo "This is a test file from $REPO on branch $NEW_BRANCH" > dummy.txt

  # Add, commit, and push
  git add dummy.txt
  git commit -m "Add dummy file to $NEW_BRANCH"
  git push origin "$NEW_BRANCH"

  cd ..
done

echo -e "\n✅ All branches created, dummy files committed, and pushed."