# Guestbook CLI

Interactive demo that uses `@openai/agents` with file tools to keep a shared guestbook under `tmp/`.

## Run

```
pnpm run:guestbook
```

## Prompts

- User name
- Tone (friendly/formal/sarcastic/cyberpunk)
- Language (en/fi)
- Fun fact (optional)
- What the user is building (optional)

## Output

Writes to `tmp/guestbook.md`. Paths are relative to `tmp/` inside the agent tools.
