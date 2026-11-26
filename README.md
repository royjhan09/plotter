# Plotter

A personal desktop chat app (Electron + React) that runs on your ChatGPT plan through
OpenAI's **Sign in with ChatGPT** open-source token sharing. There is no API key: replies count toward
your ChatGPT plan's usage. You can set a weekly cap for Plotter at https://chatgpt.com/settings/usage.

## Run

```
npm install
npm run dev      # development: window code hot-reloads, main/preload changes restart the app
npm run dev:browser   # development with no Electron window: open http://localhost:5173 in any browser
npm run build && npm start   # the built app
```

`dev:browser` runs the Plotter process without a window. The page reaches it through a development-only
bridge on `127.0.0.1:5199` (`main/devBridge.ts`). The bridge answers only the dev server's origin, and a
built app never starts it. Only one Plotter can run at a time, so close the desktop app before you start
`dev:browser`. `.claude/launch.json` lets Claude open `dev:browser` in its browser pane.

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
