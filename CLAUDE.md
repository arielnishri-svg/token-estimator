# Token estimator

A chat client that counts tokens and estimates cost before every Claude API call, with a side-by-side model comparison.

## Your role here
Work only on this project. Leave other projects and vault-wide strategy to sessions opened in the vault.

## Context
- Vault note: ~/Documents/Second Brain/Projects/Token estimator.md. Read its Status, Notes and Open items before working. The current next step lives there, not here.
- Notebook: NOTEBOOK.md in this folder. Read it if it exists. Never undo its "Decisions made" without asking.

## Skills
Central skills in ~/.claude/skills and plugins load everywhere, so nothing is copied here. Most useful for this project: Ask which project skills fit; add them here as you use them.
A new skill only this project needs goes in .claude/skills/ inside this folder.

## Write back
After any change to the project, add a dated line under "## Log" in the vault note (newest first), update "Next step" if it changed, add the same line to log.md, then run `python3 ~/.claude/hooks/hot-build.py`.
When an open item or a linked to-do in Tasks.md is finished, tick it as "- [x]" (the hourly run moves it to the Log or to ## Done). New actions go under "## Open items" as "- [ ] text (YYYY-MM-DD)".
When something went better or worse than expected, add one line under "## Lessons" in the vault note (create the heading if missing): "- YYYY-MM-DD: what happened. Next time: what to do differently." Read Lessons before starting similar work.
