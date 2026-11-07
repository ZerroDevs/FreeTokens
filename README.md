# FreeTokens

An unofficial, cross-platform Freebuff and Antigravity usage tracker with a tray popover, a
classic menu-bar / tray menu and a command line. It shows your Freebuff hours, session timers and
measured token usage from Freebuff and Antigravity, with estimated dollar costs at public API
rates.

> **Unofficial.** FreeTokens is not affiliated with, endorsed by, or supported by Freebuff,
> Codebuff or CodebuffAI. It only reads your own usage with your existing Freebuff login.

## What it shows

| Row | Source |
| --- | --- |
| **Daily Hours** – hours left in today's free pool and when it resets | Freebuff session endpoint (read-only GET) |
| **Hours Balance** – your separate wallet, in whole hours (5 Freebucks = 1 hour) | same |
| **Monthly Spend** – when Freebuff reports USD | same |
| **Session timers** – time left on each active session, in the menu bar title on macOS and in the tooltip elsewhere | same |
| Legacy **Daily / Weekly / Monthly / 5-Day / Premium** session windows on older accounts | same |
| **Today / Yesterday / Week / Last 30 Days** tokens per model and by source, with estimated cost | Freebuff hosted run history, Freebuff Desktop's local history, and Antigravity app, IDE, Agy CLI, Claude, Codex and OpenCode local history |

The usage panel groups by **Tool** (the model row as measured, with the tool that ran it) or by
**Provider** (the company serving the model), and the donut, its legend and the breakdown all follow
that choice. Provider grouping keeps a Claude Code, Codex or OpenCode session running another
provider's model attributed to that provider. The per-source totals sit under the chart in both cases.

Token counts are measured receipts, never estimates. Dollar figures are **estimates at public API
prices** (the [OpenRouter](https://openrouter.ai/api/v1/models) model list and the OpenUsage
pricing supplement), not what Freebuff charges you. A total marked `≥` is a lower bound: some
tokens belong to a model with no public price, or some runs have no complete receipt yet.

## Install

Download the archive for your platform from
[Releases](https://github.com/tverma101/FreeTokens/releases), check it against `checksums.txt`, and
extract `freetokens` (`freetokens.exe` on Windows) somewhere on your `PATH`.

| OS | Architectures |
| --- | --- |
| macOS 12+ | Apple silicon (`arm64`), Intel (`amd64`) |
| Windows 10+ | `amd64`, `arm64`, `386` |
| Linux | `amd64`, `arm64`, `armv6`, `armv7`, `386`, `riscv64`, `ppc64le`, `s390x`, `loong64` |
| FreeBSD | `amd64`, `arm64` |
| OpenBSD | `amd64`, `arm64` |
| NetBSD | `amd64` |

Windows and macOS archives include the popover UI. Linux and BSD archives keep the CGO-free
classic tray; see [Build from source](#build-from-source) for the Linux popover.

**Windows:** extract the zip to a folder such as `%LOCALAPPDATA%\Programs\FreeTokens`. It holds two
copies of the same program: `freetokens.exe` for the command line, and `freetokensw.exe`, which
opens the popover without a console window. Double-click `freetokensw.exe` (or run `freetokens.exe`
with no arguments) and the popover appears above the notification area. The gear sets the refresh
interval and **Start at login**; right-click the tray icon for **Refresh Now**, **Settings** and
**Exit**. Windows may hide new tray icons under the **^** arrow; drag the icon onto the taskbar to
keep it visible. SmartScreen may warn on first launch because releases aren't code-signed yet;
choose **More info → Run anyway**.

**macOS:** click the menu bar coin to open the popover; right-click for the classic menu.

On Windows the popover is pure Go and uses the WebView2 runtime that ships with Windows 11 (Edge
installs it on Windows 10). The macOS build uses cgo. The Linux/BSD CLI and classic tray stay
pure Go, so they work on servers too. The Linux and BSD tray needs a desktop with
StatusNotifierItem support: KDE, or GNOME with the AppIndicator extension, Xfce, Cinnamon, and
others.

macOS builds aren't notarized yet. After extracting, clear the quarantine flag once:

```bash
xattr -d com.apple.quarantine ./freetokens
```

Or build from source with Go 1.26+:

```bash
go install github.com/tverma101/FreeTokens/cmd/freetokens@latest
```

`go install` builds without the popover and gives you the CLI plus the classic tray.

## Build from source

The popover frontend is embedded at compile time, so build it before the Go binary. Node 22+ is
required; Wails needs Xcode command-line tools on macOS, and GTK/WebKit headers on Linux.

```bash
npm --prefix cmd/freetokens/web ci
npm --prefix cmd/freetokens/web run build
go build -tags "gui production" ./cmd/freetokens
```

The `production` tag is required: without it Wails compiles a desktop stub that opens an error
dialog instead of the popover. On Linux use the WebKit 4.1 tag (Ubuntu 24.04+):

```bash
go build -tags "gui production webkit2_41" ./cmd/freetokens
```

Without `-tags gui`, the same source builds the CGO-free CLI and classic tray. Releases are built
with GoReleaser, which runs the frontend build first.

## Use

```bash
freetokens            # popover when a desktop session exists, otherwise a status report
freetokens tray       # classic tray / menu bar menu
freetokens status     # one-off report; --json for scripts
freetokens autostart on   # on Windows this registers freetokensw.exe
```

You need to have signed in once with the Freebuff CLI (`freebuff login`). FreeTokens reads the
CLI's existing `default` profile and never signs in, starts a session, or changes your account. It
looks for the token in these places, in order:

1. `authToken` in `~/.config/manicode/credentials.json`, or in `$FREEBUFF_CONFIG_DIR/credentials.json`.
2. Current Freebuff CLIs store the token in the OS credential store under service `freebuff-cli`:
   the macOS Keychain, Windows Credential Manager, or the Secret Service on Linux.
3. `CODEBUFF_API_KEY`.

**Credential prompts.** Background refreshes never show a password or keychain prompt. If the OS
needs your approval, the tray shows a warning. Choose **Refresh Now** (or run
`freetokens status --prompt`) and allow access.

On macOS, choose **Always Allow**. The Keychain ties that approval to the binary's code signature,
and releases are not Developer ID-signed yet, so macOS asks once more after each update.

Freebuff Desktop's local history (`~/.config/freebuff-desktop/projects/*/desktop-v2.db`) is
read-only, and FreeTokens only reads its usage counters and model fields, never conversation
text. Hosted history events other than metrics are skipped without being decoded.

Antigravity's local stores (`~/.gemini/antigravity*/conversations/*.db`) are also read-only. The
scanner decodes each generation record to keep its token counters, model identity and step
timestamp; prompts and tool payloads are discarded and never stored or sent. Antigravity usage is
labeled by source (**Antigravity**, **Antigravity IDE**, or **Agy CLI**) in the model breakdown, and totalled
per source (**Freebuff**, **Antigravity app**, **Antigravity IDE**, **Agy CLI**) above it.

Claude Code's transcripts (`~/.claude/projects/**/*.jsonl`) are read-only too. Only assistant
responses carrying a usage receipt are counted, one turn per message id, so a response split across
content blocks is not counted twice. Input, output, cache-write and cache-read tokens are all
included; prompts, thinking blocks and tool payloads are never kept. Those sessions are labelled
**Claude** in the model breakdown and the per-source summary, because Claude Code can also be pointed
at non-Anthropic models. The Claude desktop app keeps no local token receipts, so only Claude Code
sessions are measured.

Codex's session rollouts (`~/.codex/sessions/**/*.jsonl`), written by both the Codex CLI and the
Codex app, are read-only as well. Each `token_usage_record` is one model response, counted once by
response id and labelled **Codex**; sessions from Codex versions that only report a running total
fall back to the per-turn deltas. Codex counts cached input inside its input total, so those are
split out for the cost estimate instead of being counted twice. The rollouts do not distinguish the
CLI from the app, so both are reported under the single **Codex** source.

OpenCode's session database (`~/.local/share/opencode/opencode.db`, or `$XDG_DATA_HOME/opencode`)
is read-only too. Only `assistant` messages carrying token counters are counted: input, output,
reasoning and cache read/write, where reasoning is reported beside output rather than inside it and
input excludes cache reads. Prompts, tool output and diffs are never kept. Messages are labelled
**OpenCode** in the model breakdown and the per-source summary. OpenCode records the provider of
every message, so that measured vendor is shown even when the model name would suggest another one;
when the recorded id is a gateway or a host rather than a vendor (`openrouter`, `groq`), the model
id decides as it does for Claude and Codex. OpenCode's own Zen models, which no public catalog
lists, are shown as **OpenCode Zen**.

## Updates (opt-in)

FreeTokens never contacts GitHub unless you ask it to. The popover's **Settings → Updates** checks
for a newer release and links to it; it does not install anything. The classic tray keeps the
automatic options under **Settings → Updates from GitHub Releases**:

- **Never Check** (default)
- **Check Daily and Notify** shows an **Install** item when a release is available
- **Check Daily and Install** downloads, verifies and restarts automatically

Or from the CLI:

```bash
freetokens config set auto-update notify   # off | notify | auto
freetokens update --check
freetokens update
```

Each update is checked against the release's `checksums.txt` (SHA-256) before the running binary
is replaced. If FreeTokens is installed somewhere you can't write, such as a system directory,
update it the way you installed it.

## Settings and files

| What | Where |
| --- | --- |
| Settings | the popover gear, the tray's **Settings**, or `freetokens config get` (stored in your OS config directory under `FreeTokens/`) |
| Caches, tray log | the OS cache directory under `FreeTokens/` (e.g. `~/Library/Caches/FreeTokens`) |
| Diagnostics | `freetokens diagnose` prints paths, auth state and numeric quota fields, never tokens |

## Privacy

FreeTokens sends requests only to:

- `www.codebuff.com`: your session, model catalog and run history, with your token
- `openrouter.ai` and `robinebers.github.io`: public price lists, without your token
- `api.github.com`: release checks, only when you enable updates

Redirects are refused, so your token can't be forwarded to another host. Caches hold no tokens.
The hosted-history cache is keyed by a SHA-256 of the token and is readable only by you.

## Differences from the QuotaBar tracker

This is a port of the Freebuff provider from a QuotaBar fork. Behavior matches it, with two
exceptions:

- Pricing uses only exact Freebuff routes (the supplement, then OpenRouter). The fuzzy LiteLLM and
  models.dev fallbacks are left out, so some unrecognized models show as unpriced instead of
  getting an approximate price.
- One supplement alias rule uses a regex lookahead that Go can't compile. It covers a Gemini
  model, not a Freebuff route, and is skipped.

## Credits

- The tracker logic is ported from a fork of [OpenUsage](https://github.com/robinebers/openusage) (QuotaBar)
  by Robin Ebers (MIT). See [NOTICE](NOTICE).
- The popover is built with [Wails](https://wails.io), React, Vite and Tailwind CSS.
- [fyne.io/systray](https://github.com/fyne-io/systray),
  [go-selfupdate](https://github.com/creativeprojects/go-selfupdate),
  [modernc.org/sqlite](https://gitlab.com/cznic/sqlite),
  [go-keyring](https://github.com/zalando/go-keyring), [wincred](https://github.com/danieljoos/wincred),
  [go-timezone-local](https://github.com/thlib/go-timezone-local).

## License

[MIT](LICENSE)
