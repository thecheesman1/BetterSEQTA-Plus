# Ask SEQTA bridge

The small server behind the BetterSEQTA+ **Ask SEQTA** chat. **Everyone runs
their own copy, on their own computer, signed in to their own Claude account.**
Nobody's subscription answers anyone else's questions.

The extension sends your question plus a text snapshot of your SEQTA data
(timetable, upcoming assessments, recent marks, recent messages) to your bridge
on `localhost`, the bridge asks Claude through your Claude Code login, and the
answer comes back. Nothing leaves your computer except the request to Claude.

## Set it up (about 2 minutes)

1. Install [Node.js](https://nodejs.org) 22 or newer.
2. Install Claude Code and sign in once: `npm i -g @anthropic-ai/claude-code`, then `claude`.
3. Start the bridge from this folder: `node server.mjs`. On Windows you can double-click `start.cmd` instead.
   You should see `mode=local (this computer only)`.
4. In BetterSEQTA+ settings, leave **Ask SEQTA → Bridge URL** on `http://localhost:8737`.

That's it. There's no `npm install` for this mode, so `server.mjs` is the only file you need.

## Safety

- **This computer only:** it only listens on `127.0.0.1`, and refuses to start on any other address.
- **Only the extension can use it:** requests need the `X-Ask-Seqta` header and an extension origin.
  A website open in your browser can't send that, because doing so needs a CORS preflight, which
  the bridge never approves. So a site can't spend your Claude usage.
- **No tools:** Claude runs with no tools (`--tools ""`). If text in your SEQTA data says something
  like "ignore your instructions", the worst it can do is make an answer wrong. It can't make Claude
  run anything.
- **Nothing logged:** questions and data are never written to logs or disk.

## Settings (environment variables, all optional)

| Variable | Default | |
|---|---|---|
| `STYLE` | chill co-pilot | Default voice when the extension doesn't send a Personality |
| `MODEL` | `claude-haiku-5-5` | Model to use. Try `claude-sonnet-5-5` for harder questions |
| `EFFORT` | `low` | `low` / `medium` / `high` |
| `PORT` | `8737` | Change it in the extension's Bridge URL too |
| `PER_KEY_PER_HOUR` | `60` | Questions per hour |

Advanced: `BACKEND=api` with `ANTHROPIC_API_KEY` uses the Anthropic API instead (billed per request).
That's the only mode that can be shared with other people (`OPEN=1`). It needs `npm ci`.
