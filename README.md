# Plotter

A personal desktop chat app (Electron + React) that runs on your ChatGPT plan through
OpenAI's **Sign in with ChatGPT** open-source token sharing. There is no API key: replies count toward
your ChatGPT plan's usage. You can set a weekly cap for Plotter at https://chatgpt.com/settings/usage.

## Run

```
npm install
npm run dev      # development, hot reload
npm run build && npm start   # the built app
```

## How it works

- `main/auth.ts`: OAuth with PKCE against `auth.openai.com`, using a loopback redirect
  (`http://127.0.0.1:1455/auth/callback`). The first sign-in registers this install with
  `client_id=dynamic_agent_client`, and the issued client id is reused after that. Tokens are encrypted
  with Windows DPAPI (`safeStorage`) under `%APPDATA%\Plotter`. Refresh tokens rotate, so refreshes
  run one at a time.
- `main/openai.ts`: streams from `POST https://api.openai.com/v1/responses` with `store:false` and
  `stream:true`. Each request resends the full history. It follows the
  [preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).
- `main/store.ts`: one JSON file per chat under `%APPDATA%\Plotter\chats`.
- `renderer/`: the chat UI, styled after the icon (cream, seed-bot orange, sprout green).

Docs: https://developers.openai.com/siwc

## License

MIT
