# Context Meter

A Claude Code mod: how full your context is, against a limit you choose, at the bottom right of the footer.

```text
⏵⏵ auto mode on                                   ctx ━━━━━━───── 60% 600k/1M
```

The bar is the model's context window, as the engine reports it (1M on a 1M model): green up to 30%, orange up to 80% and red after that.

Some people keep their context small on purpose, say 250k, even when the model allows a million. Set that size in `/config` (`limitTokens`, empty by default) and the bar fills up to it instead: 125k is then half the bar. Past the limit it stays full and red, with the percentage going past 100%.

A limit past the model's own window counts as the window. Until the first response of a session, and after `/clear` or a compaction, there is nothing to show, so the footer stays as it is. In a terminal narrower than 90 columns the bar goes and the figures stay.

It sits beside [Sub Meter](../sub-meter) and [Narrator](../narrator) in the same footer row.

## Install

```text
/plugin marketplace add midudev/better-claude
/plugin install context-meter@better-claude
```

## How it works

One hooks module ([`hooks/register.tsx`](hooks/register.tsx)):

- `session.measure` hands it the context window's fill after each response (`context.tokens` over `context.window`); `$.session.usage()` gives the first reading at start.
- The last reading is kept in `$.store`, so a new session shows it before its first response.
- A `ui.render` hook on `SessionMode` draws the meter before what is beneath it.

## Development

```bash
claude plugin validate ./plugins/context-meter   # from the repository root
claude plugin test ./plugins/context-meter       # runs hooks/register.test.tsx against the engine
```

MIT © Miguel Ángel Durán (midudev)
