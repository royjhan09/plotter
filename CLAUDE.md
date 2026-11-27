# Plotter: development rules

## Context budget (every model call)

Everything sent with a model call is paid for on every call, and again on every tool round of one reply (Plotter
keeps no conversation on the server). So:

- **Always sent: only what is small, needed often, or never changes.** Stable, shared text goes first: it is
  cached across messages and chats.
- **Loaded when needed: anything large, only sometimes needed, or that grows with the user's data** (the design kit,
  connected apps, Market tools, long lists). The model gets one line saying it exists and opens it with
  `open_capability` the first time a reply needs it; its guide and tools then arrive for the rest of that reply
  (`Capability` in `main/assistant.ts`; a tool may return `addTools`).
- **What changes goes last:** memories, project notes, the chat beside, this turn's ask. Anything that changes
  between calls must not sit before text that could otherwise be cached.
- **Lists that grow get a cap** (memories: newest up to `MEMORY_CAP`; project memory: `PROJECT_MEMORY_LIMIT`).
- **Send once, then only changes,** where a session keeps context (Claude Code: the kit, project and pictures notes
  go once per session and again only when they change).
- **No model calls that are not needed now** (e.g. no title or suggestion calls between a team's turns).
- **Measure before and after** any change to what a call carries, on the dev server (`npm run dev:browser`):
  `debug:setup` (chat id) gives the size of every part of a reply's set-up; `debug:usage` gives input, cached and
  output tokens per call, tagged by what the call is for (`debug:usageClear` resets it).

The same rule applies to features Plotter builds into the apps it helps make.
