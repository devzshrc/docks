#!/bin/sh
# Dev servers in separate tmux windows — no macOS Automation permission needed.
# Re-running attaches to the existing session instead of duplicating windows.
set -e
SESSION="docks"

if tmux has-session -t "$SESSION" 2>/dev/null; then
  if [ -n "$TMUX" ]; then
    tmux switch-client -t "$SESSION"
  else
    tmux attach -t "$SESSION"
  fi
  exit 0
fi

tmux new-session -d -s "$SESSION" -n server "pnpm dev:server"
tmux new-window -t "$SESSION" -n web "pnpm dev:web"
tmux select-window -t "$SESSION:web"

if [ -n "$TMUX" ]; then
  tmux switch-client -t "$SESSION"
else
  tmux attach -t "$SESSION"
fi
