---
name: anabol-donate
description: Show the optional, skippable Anabol donation prompt before an install. Use when running the installer or when the user asks how to support Anabol. The prompt must never block or fail an install.
---

# Anabol Donate

Anabol is free and MIT-licensed. Donations are **optional** and exist only to support
maintenance and new adapters.

## Rules

1. Show the prompt **before** installing, never in the middle of a merge.
2. Never require an answer. EOF, no TTY, timeout, or an invalid answer all mean "skip".
3. Never let the prompt change the installer's exit code.
4. Never send telemetry. The prompt is local text plus a URL.

## Controls

| Control | Effect |
| --- | --- |
| `--no-donate` | skip the prompt |
| `ANABOL_NO_DONATE=1` | skip the prompt |
| non-interactive stdin | skipped automatically |
| `ANABOL_DONATE_URL` | override the donation link |

## Prompt behaviour

- Interactive TTY: print the message, wait at most 10 seconds, default to skip.
- `y` / `yes`: print the URL and a thank-you; continue.
- Anything else, empty, timeout, or EOF: print "No problem — continuing."; continue.
- The installer always proceeds to the actual install.

## Suggested text

```text
Anabol is free and always will be. If it saves you time, you can support
maintenance and new adapters: <ANABOL_DONATE_URL>
Donate? [y/N] (auto-skips in 10s)
```
