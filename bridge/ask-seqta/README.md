# Ask SEQTA bridge

Small Node server behind the BetterSEQTA+ **Ask SEQTA** chat. The extension
sends a question plus a text snapshot of the student's SEQTA data (timetable,
upcoming assessments, recent marks, recent messages); this asks Claude and
returns the answer. Bodies are never logged or stored.

## Backends

| `BACKEND` | Uses | Who may use it |
|---|---|---|
| `api` | `ANTHROPIC_API_KEY`, billed per request | Anyone (`OPEN=1`), rate limited |
| `cli` | `claude -p` on **your** Claude subscription | Only you. It refuses to start with `OPEN=1`: a subscription is personal and isn't for serving other people |

Claude never gets tools, so text inside SEQTA data (e.g. a message saying
"ignore your instructions") can at worst skew an answer, never run anything.

## Run

```sh
npm ci
cp .env.example .env    # then fill in ANTHROPIC_API_KEY
npm start               # http://127.0.0.1:8737/health
```

Optional `keys.json` for personal access keys with a higher limit:

```json
[{ "id": "ezra", "key": "long-random-string" }]
```

## Pi deploy

```sh
sudo cp ask-seqta.service /etc/systemd/system/
sudo systemctl enable --now ask-seqta
```

Then in Cloudflare Zero Trust, go to Networks, then Tunnels, then your tunnel, then
Public hostnames, and add `ask-api.bin-chicken.org` pointing at `http://localhost:8737`.
