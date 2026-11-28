import { writeFile } from 'node:fs/promises'
import { app, BrowserWindow, dialog, ipcMain, shell, nativeImage, nativeTheme, protocol, session } from 'electron'
import { join } from 'node:path'
import { authState, cancelSignIn, loadSession, signIn, signOut } from './auth'
import { projectsChanged, setAppEmitter } from './appEvents'
import { getLibraryItem, listLibrary } from '@private/main/library'
import { clearImageKey, imageKeyStatus, setImageKey, setImageOn, setImageOptions } from '@private/main/images'
import { addNote, createProject, editNote, listProjects, removeNote, removeProject, removeProjectRole, renameProject, setProjectBrand, setProjectKit, setProjectRole } from './projects'
import { addWishes, cleanDraft, getRole, grantWish, listRoles, removeRole, saveCombined, saveRole, setRetired } from '@private/main/roles'
import { combineSuggestions, dismissCombo, getCompany, labelLine, linkRoles, mergeTradeoff, noteHandoff, placeRole, renameCompany, replaceInChart, setPrefer, unlinkRoles } from '@private/main/company'
import { addPieceFromReply } from '@private/main/kitOps'
import { BROWSER, captureUrl, capturePage, saveMarkup, setupBrowser } from '@private/main/browser'
import { setBrowserEmitter, setBrowserState, type BrowserTabState } from '@private/main/browserControl'
import { addUseWhen, createBrand, createKit, getBrand, getKit, kitFolder, listBrands, removeBrand, removeBrandRule, saveBrandRule, setDefaultBrand, updateBrand, kitFor, listKits, listUsage, removeComponent, removeKit, removeRule, restoreVersion, saveComponent, saveRule, setDefaultKit, updateKit, versionCode } from '@private/main/kits'
import { alsoIn, groupOf, nextSpeaker, routeIn, suggestMembers } from './team'
import { runRouteTests } from './routeTests'
import { usageLog } from './openai'
import { draftCombinedRole, draftRole, forgetModel, roleInterview, suggestRoleTools, generateProjectBrief, generateSuggestion, generateTitle, primaryModel, ReplyError } from './openai'
import { buildSetup, reply } from './assistant'
import { hire, runRecruit, worthRecruiting } from './recruit'
import { onPythonStatus, pythonStatus, PY_SCHEME } from './python'
import { connect as connectService, disconnect as disconnectService, listConnectors, setEnabled as setConnectorEnabled, setGoogleClient, setNotionToken } from './connectors'
import { onSpeechStatus, speechStatus, transcribe, warmSpeech } from './speech'
import { clearMemories, getChat, listChats, listMemories, readFeatures, readSettings, removeChat, removeMemory, saveChat, updateChatMeta, updateFeatures, updateSettings } from './store'
import { startDevBridge } from './devBridge'
import { getUiFrame, putUiFrame, UI_FRAME_CSP } from './uiFrames'
import { showInExplorer } from './frontExplorer'
import { pdfHandlers } from '@private/main/pdf'
import { addIdea, readLab, removeIdea, setLabCapture, updateIdea } from '@private/main/lab'
import { estimateLab, settleLab, startLab, stopLab } from './labRun'
import { checkMarketTool, closeAllMarket, listMarket, removeMarketTool, saveMarketTool, setMarketApproval, setMarketConnected, signInTool, signOutTool } from '@private/main/market'
import { getSkill, listSkills, readSkillFile, removeSkill, saveSkill, setSkillEnabled, uploadSkills, downloadSkill } from '@private/main/skills'
import { addFromCatalog, addPopular, catalog, listPlugins, popular, popularIcons, editPlugin, removePlugin, serverDetails, serverSkill, savePlugin, setPluginIcon, uploadPlugin } from '@private/main/plugins'
import { answerApproval, builtinApprovals, setBuiltinApproval } from '@private/main/approvals'
import { claudeCodeAvailable, makeProjectFolder, recentFolders, suggestProjectFolder, sendMember, sendToClaude, forgetGroup, settleStale, stopAllClaude, stopClaude } from '@private/main/claudeCode'
import { USAGE_URL, type LabTest, type BesideChat, type Chat, type KitComponent, type KitPatch, type BrandPatch, type PluginDetailsPatch, type KitPieceOffer, type ToolApproval, type SkillDraft, type PluginInfo, type RoleDraft, type RoleLink, type HistoryItem, type RoleDeployment, type KitRule, type LibraryRef, type ChatMetaPatch, type MarketToolInput, type ConnectorId, type Features, type ReplyEvent, type SendRequest } from '../shared/api'

app.setName('Plotter')
// Interactive previews live on their own scheme/origin (see uiFrames.ts). Must be registered before ready.
protocol.registerSchemesAsPrivileged([
  { scheme: 'plotter-ui', privileges: { standard: true, secure: true } },
  // the sandboxed Python window loads Pyodide and its packages from here (see python.ts)
  { scheme: PY_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }
])
if (process.platform === 'win32') app.setAppUserModelId('com.plotter.app')

/** `npm run dev:browser`: no Electron window; the UI runs in a browser and talks to this process over the dev bridge. */
const BROWSER_ONLY = process.env['PLOTTER_BROWSER_ONLY'] === '1' && !!process.env['ELECTRON_RENDERER_URL']

const iconPath = join(__dirname, '../../assets/icon.ico')
let win: BrowserWindow | null = null

const windowBackground = (): string => (nativeTheme.shouldUseDarkColors ? '#212121' : '#ffffff')

function createWindow(): void {
  nativeTheme.themeSource = readSettings().theme ?? 'system' // before the first choice: Windows decides
  win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 500,
    title: 'Plotter',
    icon: nativeImage.createFromPath(iconPath),
    backgroundColor: windowBackground(),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      plugins: true, // Chromium's PDF viewer, for the PDF preview before downloading
      webviewTag: BROWSER // the browser pane's pages (locked down in setupBrowser)
    }
  })
  if (BROWSER) setupBrowser(win, (url) => emit('browser:open', { url }), () => emit('browser:mark', {}))
  win.once('ready-to-show', () => win?.show())
  // Links in replies open in the real browser, never inside Plotter.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win?.webContents.getURL()) {
      e.preventDefault()
      if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    }
  })
  if (process.env['ELECTRON_RENDERER_URL']) void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
  win.on('closed', () => (win = null))
}

/** Plotter's own window may use the microphone (mic + voice mode); nothing else is granted. */
function allowMicrophone(): void {
  const own = (url: string): boolean => url.startsWith('file://') || (!!process.env['ELECTRON_RENDERER_URL'] && url.startsWith(process.env['ELECTRON_RENDERER_URL']))
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    const audioOnly = permission === 'media' && (details as { mediaTypes?: string[] }).mediaTypes?.every((t) => t === 'audio')
    callback(!!audioOnly && own(wc.getURL()))
  })
  session.defaultSession.setPermissionCheckHandler((wc, permission) => permission === 'media' && !!wc && own(wc.getURL()))
}

// ---------------------------------------------------------------- one set of handlers, two doors

type Emit = (channel: string, payload: unknown) => void
const emitters = new Set<Emit>()
const emit: Emit = (channel, payload) => emitters.forEach((e) => e(channel, payload))
setAppEmitter(emit)
setBrowserEmitter(emit)

const running = new Map<string, AbortController>()
const sendReply = (event: ReplyEvent): void => emit('reply:event', event)

/** Every call the window can make. The preload reaches them over IPC; the dev bridge over HTTP. */
export const handlers: Record<string, (...args: never[]) => unknown> = {
  'auth:state': () => authState(),
  'auth:signIn': async () => {
    const state = await signIn()
    win?.show()
    win?.focus()
    return state
  },
  'auth:cancelSignIn': () => cancelSignIn(),
  'auth:signOut': () => {
    forgetModel()
    return signOut()
  },
  'auth:welcomeSeen': () => void updateSettings({ welcomeSeen: true }),

  model: () => primaryModel(),

  'speech:transcribe': (samples: Float32Array) => transcribe(samples),
  'speech:status': () => speechStatus(),
  'speech:warm': () => warmSpeech(),

  'projects:list': () => listProjects(),
  'projects:create': (name: string) => {
    const p = createProject(String(name ?? ''))
    projectsChanged()
    // the Recruiter suggests a team, once the project has something to go on (not while it is a bare "New project")
    if (worthRecruiting(p)) void runRecruit(p.id)
    return p
  },
  'projects:rename': (id: string, name: string) => {
    const list = renameProject(String(id), String(name ?? ''))
    projectsChanged()
    const p = list.find((x) => x.id === String(id))
    if (p && !p.recruit && worthRecruiting(p)) void runRecruit(p.id)
    return list
  },
  'projects:recruit': async (id: string) => (await runRecruit(String(id))) ?? undefined,
  'projects:hire': (id: string, pick: number) => hire(String(id), Number(pick)),
  'projects:remove': (id: string) => {
    // its chats stay, outside any project
    for (const c of listChats()) if (c.projectId === id) updateChatMeta(c.id, { projectId: null })
    const list = removeProject(String(id))
    projectsChanged()
    return list
  },
  'projects:addNote': (id: string, text: string) => {
    const p = addNote(String(id), String(text ?? ''), 'You')
    projectsChanged()
    return p
  },
  'projects:editNote': (id: string, noteId: string, text: string) => {
    const p = editNote(String(id), String(noteId), String(text ?? ''))
    projectsChanged()
    return p
  },
  'team:next': async (chatId: string, history: HistoryItem[], turnsLeft: number) => {
    const chat = getChat(String(chatId))
    if (!chat?.team) return { speaker: null, done: 'This is not a team chat.' }
    const list = Array.isArray(history) ? history : []
    const turn = await nextSpeaker(chat, list, Number(turnsLeft) || 0)
    // a hand-off: the member who spoke last passes the work to another (counted per pair, for combine suggestions)
    const last = list[list.length - 1]
    if (turn.speaker && last?.role === 'assistant' && last.speaker && last.speaker !== turn.speaker)
      noteHandoff(last.speaker, turn.speaker, `${chat.id}:${list.map((h) => h.role).lastIndexOf('user')}`)
    return turn
  },
  'team:suggest': (purpose: string) => suggestMembers(String(purpose ?? '')),
  'team:route': async (chatId: string, history: HistoryItem[]) => {
    const chat = getChat(String(chatId))
    if (!chat?.team) return { answer: [] }
    return routeIn(groupOf(chat), Array.isArray(history) ? history : [], `route:${chat.id}`)
  },
  'team:also': async (chatId: string, history: HistoryItem[], spoke: string[]) => {
    const chat = getChat(String(chatId))
    if (!chat?.team) return []
    return alsoIn(groupOf(chat), Array.isArray(history) ? history : [], Array.isArray(spoke) ? spoke.map(String) : [], `also:${chat.id}`)
  },
  // dev measurements only (the browser-mode server): token use per ChatGPT call
  'debug:usage': () => (BROWSER_ONLY ? usageLog : []),
  // dev measurements only: what a ChatGPT message in this chat is set up with, part by part (characters)
  'debug:setup': async (chatId: string, part?: string) => {
    if (!BROWSER_ONLY) return null
    const { parts, tools } = await buildSetup({ requestId: 'measure', chatId: String(chatId ?? ''), model: '', effort: '', history: [] })
    // one part's whole text, to check what it says
    if (part) return parts.filter((p) => p.name === part).map((p) => p.text).join('\n\n')
    const byPack = new Map<string, { tools: number; chars: number }>()
    for (const t of tools) {
      const b = byPack.get(t.pack) ?? { tools: 0, chars: 0 }
      byPack.set(t.pack, { tools: b.tools + 1, chars: b.chars + JSON.stringify({ name: t.name, description: t.description, parameters: t.parameters }).length })
    }
    const text = new Map<string, number>()
    for (const p of parts) text.set(p.name, (text.get(p.name) ?? 0) + p.text.length)
    return { instructions: Object.fromEntries(text), tools: Object.fromEntries(byPack) }
  },
  // dev only: how well a group chat picks who answers and who else is needed (see main/routeTests.ts)
  'debug:routeTest': (times?: number) => (BROWSER_ONLY ? runRouteTests(Math.min(5, Math.max(1, Number(times) || 2))) : null),
  'debug:usageClear': () => {
    if (BROWSER_ONLY) usageLog.length = 0
  },
  'company:get': () => getCompany(),
  'company:rename': (name: string) => renameCompany(String(name ?? '')),
  'company:place': (roleId: string, reportsTo: string | null) => placeRole(String(roleId), reportsTo ? String(reportsTo) : null),
  'company:labelLine': (roleId: string, label: string) => labelLine(String(roleId), String(label ?? '')),
  'company:link': (link: Omit<RoleLink, 'id'>) => linkRoles(link ?? ({} as Omit<RoleLink, 'id'>)),
  'company:unlink': (id: string) => unlinkRoles(String(id)),
  'lab:get': () => {
    settleLab()
    // the chat an idea came from, under its title now (it may have been named after the idea was noted)
    const s = readLab()
    return { ...s, ideas: s.ideas.map((i) => (i.from.chatId ? { ...i, from: { ...i.from, chatTitle: getChat(i.from.chatId)?.title ?? i.from.chatTitle } } : i)) }
  },
  'lab:add': (idea: { title: string; claim: string }) => addIdea(idea ?? { title: '', claim: '' }),
  'lab:update': (id: string, change: Record<string, unknown>) => {
    // what the user may change by hand (a test's result and progress come only from a run)
    const c = change ?? {}
    const status = c['status'] === 'dismissed' || c['status'] === 'new' ? { status: c['status'] as 'dismissed' | 'new' } : {}
    return updateIdea(String(id), {
      ...(typeof c['title'] === 'string' && c['title'].trim() ? { title: c['title'].trim().slice(0, 120) } : {}),
      ...(typeof c['claim'] === 'string' && c['claim'].trim() ? { claim: c['claim'].trim().slice(0, 600) } : {}),
      ...(c['test'] && typeof c['test'] === 'object' ? { test: c['test'] as LabTest } : {}),
      ...status
    })
  },
  'lab:remove': (id: string) => {
    stopLab(String(id))
    return removeIdea(String(id))
  },
  'lab:setCapture': (on: boolean) => setLabCapture(!!on),
  'lab:estimate': (test: LabTest) => estimateLab(test),
  'lab:run': (id: string, test: LabTest) => startLab(String(id), test),
  'lab:stop': (id: string) => stopLab(String(id)),
  'roles:interview': async (messages: { role: 'user' | 'assistant'; text: string }[]) => {
    const r = await roleInterview(Array.isArray(messages) ? messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', text: String(m.text ?? '') })) : [])
    return { reply: r.reply, ...(r.role && String(r.role.name ?? '').trim() ? { draft: cleanDraft({ purpose: String(r.role.tagline ?? r.role.name), ...r.role }) } : {}) }
  },
  'roles:list': () => listRoles(),
  'roles:suggestTools': async (id: string) => {
    const role = getRole(String(id))
    if (!role) throw new Error('No such role.')
    const tools = await suggestRoleTools(role, (role.wishes ?? []).filter((w) => w.from === 'work').map((w) => `${w.tool}: ${w.why}`))
    return addWishes(role.id, tools, 'review') ?? role
  },
  'roles:grantWish': (id: string, tool: string, give: boolean) => grantWish(String(id), String(tool ?? ''), !!give),
  'roles:combineDraft': async (a: string, b: string) => {
    const ra = getRole(String(a))
    const rb = getRole(String(b))
    if (!ra || !rb || ra.id === rb.id) throw new Error('Pick two different roles.')
    const draft = cleanDraft(await draftCombinedRole(ra, rb))
    if (!draft.name) throw new Error('ChatGPT did not draft the combined role. Try again.')
    return { draft, tradeoff: mergeTradeoff(ra, rb, draft) }
  },
  'roles:combine': (a: string, b: string, draft: RoleDraft) => {
    const ra = getRole(String(a))
    const rb = getRole(String(b))
    if (!ra || !rb || ra.id === rb.id) throw new Error('Pick two different roles.')
    const made = saveCombined(ra, rb, cleanDraft(draft))
    setRetired(ra.id, true)
    setRetired(rb.id, true)
    replaceInChart(ra.id, rb.id, made.id)
    return getRole(made.id) ?? made
  },
  'roles:restore': (id: string) => setRetired(String(id), false),
  'roles:combineSuggestions': () => combineSuggestions(listRoles()),
  'roles:dismissCombo': (a: string, b: string) => dismissCombo(String(a), String(b)),
  'company:setPrefer': (prefer: 'cost' | 'speed') => setPrefer(prefer === 'speed' ? 'speed' : 'cost'),
  'roles:save': (role: RoleDraft & { id?: string }) => saveRole({ ...role }),
  'roles:remove': (id: string) => removeRole(String(id)),
  'roles:draft': async (input: { name: string; purpose: string }) => cleanDraft(await draftRole({ name: String(input?.name ?? ''), purpose: String(input?.purpose ?? '') })),
  'projects:setRole': (id: string, d: RoleDeployment) => {
    const p = setProjectRole(String(id), d)
    projectsChanged()
    return p
  },
  'projects:removeRole': (id: string, roleId: string) => {
    const p = removeProjectRole(String(id), String(roleId))
    projectsChanged()
    return p
  },
  'projects:setKit': (id: string, kitId: string | null) => {
    const p = setProjectKit(String(id), kitId ? String(kitId) : null)
    projectsChanged()
    return p
  },
  'projects:setBrand': (id: string, brandId: string | null) => {
    const p = setProjectBrand(String(id), brandId ? String(brandId) : null)
    projectsChanged()
    return p
  },
  'brands:list': () => listBrands(),
  'brands:get': (id: string) => getBrand(String(id)),
  'brands:create': (name: string, copyFrom?: string) => createBrand(String(name ?? ''), copyFrom ? String(copyFrom) : undefined),
  'brands:update': (id: string, patch: BrandPatch) => updateBrand(String(id), patch ?? {}),
  'brands:remove': (id: string) => removeBrand(String(id)),
  'brands:setDefault': (id: string) => setDefaultBrand(String(id)),
  'brands:saveRule': (id: string, rule: Partial<KitRule> & { text: string }) => saveBrandRule(String(id), { ...rule, text: String(rule?.text ?? '') }),
  'brands:removeRule': (id: string, ruleId: string) => removeBrandRule(String(id), String(ruleId)),
  'kits:list': () => listKits(),
  'kits:get': (id: string) => getKit(String(id)),
  'kits:create': (name: string, copyFrom?: string) => createKit(String(name ?? ''), copyFrom ? String(copyFrom) : undefined),
  'kits:update': (id: string, patch: KitPatch) => updateKit(String(id), patch ?? {}),
  'kits:remove': (id: string) => removeKit(String(id)),
  'kits:setDefault': (id: string) => setDefaultKit(String(id)),
  'kits:saveRule': (id: string, rule: Partial<KitRule> & { text: string }) => saveRule(String(id), { ...rule, text: String(rule?.text ?? '') }),
  'kits:removeRule': (id: string, ruleId: string) => removeRule(String(id), String(ruleId)),
  'kits:saveComponent': (id: string, c: Partial<KitComponent> & { name: string; code: string }) =>
    saveComponent(String(id), { ...c, name: String(c?.name ?? ''), code: String(c?.code ?? '') }),
  'kits:removeComponent': (id: string, cid: string) => removeComponent(String(id), String(cid)),
  'kits:usage': (id: string) => listUsage(String(id)),
  'browser:capture': (webContentsId: number) => capturePage(Number(webContentsId)),
  'browser:captureUrl': (url: string, width: number, height: number) => captureUrl(String(url), Number(width), Number(height)),
  'browser:saveMarkup': (dataUrl: string) => saveMarkup(String(dataUrl)),
  'browser:state': (s: { open: boolean; active: number | null; tabs: BrowserTabState[] }) => setBrowserState(s),
  'kits:addFromReply': (projectId: string | null, piece: KitPieceOffer, chatTitle?: string) => {
    const kit = kitFor(listProjects().find((p) => p.id === projectId)?.kitId)
    if (!kit) throw new Error('There is no design kit to add it to.')
    return addPieceFromReply(kit.id, { name: String(piece?.name ?? ''), code: String(piece?.code ?? ''), useWhen: piece?.useWhen, of: piece?.of, uses: piece?.uses }, chatTitle ? String(chatTitle) : undefined)
  },
  'kits:versionCode': (id: string, cid: string, v: number) => versionCode(String(id), String(cid), Number(v)),
  'kits:restoreVersion': (id: string, cid: string, v: number) => restoreVersion(String(id), String(cid), Number(v)),
  'kits:addUseWhen': (id: string, cid: string, situation: string) => addUseWhen(String(id), String(cid), String(situation ?? '')),
  'kits:openFolder': async (id: string) => {
    const folder = kitFolder(String(id))
    if (BROWSER_ONLY) return showInExplorer(folder)
    await shell.openPath(folder)
  },
  'projects:removeNote': (id: string, noteId: string) => {
    const p = removeNote(String(id), String(noteId))
    projectsChanged()
    return p
  },

  'library:list': () => listLibrary(),
  'library:get': (ref: LibraryRef) => getLibraryItem(ref),
  'images:status': () => imageKeyStatus(),
  'images:setKey': (key: string) => setImageKey(String(key ?? '')),
  'images:clearKey': () => clearImageKey(),
  'images:setOn': (on: boolean) => setImageOn(!!on),
  'images:setOptions': (patch: Record<string, unknown>) => {
    setImageOptions({ model: typeof patch?.['model'] === 'string' ? patch['model'] : undefined, quality: patch?.['quality'] as 'low' | 'medium' | 'high' | undefined })
    return imageKeyStatus()
  },

  'chats:list': () => listChats(),
  'chats:get': (id: string) => {
    const chat = getChat(id)
    return chat ? settleStale(chat) : null
  },
  'chats:save': (chat: Chat) => {
    saveChat(chat)
    if (chat.kind !== 'claude') updateSettings({ lastModel: chat.model })
  },
  'chats:remove': (id: string) => {
    stopClaude(String(id))
    // a group: stop its Claude Code members and forget their sessions
    forgetGroup(String(id))
    removeChat(id)
  },
  'chats:update': (id: string, patch: ChatMetaPatch) => {
    updateChatMeta(String(id), patch ?? {})
    return listChats()
  },
  'chats:title': (userText: string, replyText: string) => generateTitle(userText, replyText),
  'chats:suggest': (kind: string, userText: string, replyText: string) => generateSuggestion(kind === 'claude' ? 'claude' : 'chatgpt', String(userText ?? ''), String(replyText ?? '')),
  'chats:brief': (id: string) => {
    const chat = getChat(String(id))
    if (!chat) throw new Error('That chat no longer exists.')
    return generateProjectBrief(chat)
  },
  'ui:put': (html: string, dark: boolean, live?: boolean) => putUiFrame(String(html), !!dark, !!live),

  'features:get': () => readFeatures(),
  'features:set': (patch: Partial<Features>) => updateFeatures(patch ?? {}),
  'memory:list': () => listMemories(),
  'memory:remove': (id: string) => removeMemory(String(id)),
  'memory:clear': () => clearMemories(),
  'connectors:list': () => listConnectors(),
  'connectors:setGoogleClient': (id: string, secret: string) => setGoogleClient(String(id), String(secret)),
  'connectors:setNotionToken': (token: string) => setNotionToken(String(token)),
  'connectors:connect': (id: ConnectorId) => connectService(id),
  'connectors:disconnect': (id: ConnectorId) => disconnectService(id),
  'connectors:setEnabled': (id: ConnectorId, on: boolean) => setConnectorEnabled(id, !!on),
  'python:status': () => pythonStatus(),

  'market:list': () => listMarket(),
  'market:save': (tool: MarketToolInput) => saveMarketTool(tool ?? ({} as MarketToolInput)),
  'market:remove': (id: string) => removeMarketTool(String(id)),
  'market:setConnected': (id: string, on: boolean) => setMarketConnected(String(id), !!on),
  'market:check': (id: string) => checkMarketTool(String(id)),
  'market:setApproval': (id: string, level: ToolApproval) => setMarketApproval(String(id), level),
  'market:signIn': (id: string) => signInTool(String(id)),
  'market:signOut': (id: string) => signOutTool(String(id)),
  'plugins:popular': () => popular(),
  'plugins:popularIcons': () => popularIcons(),
  'plugins:serverDetails': (target: { popularId?: string; toolId?: string }, refresh?: boolean) => serverDetails({ ...(target?.popularId ? { popularId: String(target.popularId) } : {}), ...(target?.toolId ? { toolId: String(target.toolId) } : {}) }, !!refresh),
  'plugins:serverSkill': (target: { popularId?: string; toolId?: string }, uri: string) => serverSkill({ ...(target?.popularId ? { popularId: String(target.popularId) } : {}), ...(target?.toolId ? { toolId: String(target.toolId) } : {}) }, String(uri)),
  'plugins:addPopular': (id: string, key?: string) => addPopular(String(id), key ? String(key) : undefined),
  'skills:list': () => listSkills(),
  'skills:get': (id: string) => getSkill(String(id)),
  'skills:readFile': (id: string, path: string) => readSkillFile(String(id), String(path)),
  'skills:save': (draft: SkillDraft) => (saveSkill(draft, draft?.id ? undefined : 'you'), listSkills()),
  'skills:setEnabled': (id: string, on: boolean) => setSkillEnabled(String(id), !!on),
  'skills:remove': (id: string) => removeSkill(String(id)),
  'skills:download': (id: string) => downloadSkill(String(id)),
  'skills:upload': (input: { zip?: string; files?: { path: string; base64: string }[] }) => uploadSkills(input ?? {}),
  'plugins:list': () => listPlugins(),
  'plugins:save': (pl: Omit<PluginInfo, 'id' | 'addedAt' | 'source'> & { id?: string }) => savePlugin(pl),
  'plugins:remove': (id: string) => removePlugin(String(id)),
  'plugins:edit': (id: string, patch: PluginDetailsPatch) => editPlugin(String(id), patch ?? {}),
  'plugins:setIcon': (id: string, icon: string | null) => setPluginIcon(String(id), icon ? String(icon) : null),
  'plugins:upload': (input: { zip?: string; files?: { path: string; base64: string }[] }) => uploadPlugin(input ?? {}),
  'plugins:catalog': () => catalog(),
  'plugins:addFromCatalog': (kind: 'skill' | 'plugin', id: string) => addFromCatalog(kind === 'plugin' ? 'plugin' : 'skill', String(id)),
  'plugins:builtinApproval': () => builtinApprovals(),
  'plugins:setBuiltinApproval': (id: string, level: ToolApproval) => setBuiltinApproval(String(id), level),
  'approvals:answer': (id: string, allow: boolean) => answerApproval(String(id), !!allow),

  // Send to Claude Code: the user's own Claude Code runs a task in a project folder (see claudeCode.ts).
  'claudeCode:available': () => claudeCodeAvailable(),
  'claudeCode:folders': () => recentFolders(),
  'claudeCode:pickFolder': async () => {
    if (!win) return null // dev browser mode: no window to attach the chooser to (it would open hidden)
    const r = await dialog.showOpenDialog(win, { title: 'Choose the project folder for Claude Code', properties: ['openDirectory'] })
    return r.canceled ? null : (r.filePaths[0] ?? null)
  },
  'claudeCode:send': (chatId: string, messageId: string, beside?: BesideChat) => sendToClaude(String(chatId), String(messageId), (u) => emit('claudeCode:update', u), beside),
  'claudeCode:sendMember': (chatId: string, messageId: string, roleId: string, by: string) => sendMember(String(chatId), String(messageId), String(roleId), String(by || 'you'), (u) => emit('claudeCode:update', u)),
  'claudeCode:suggestFolder': (name: string) => suggestProjectFolder(String(name ?? '')),
  'claudeCode:makeFolder': (path: string) => makeProjectFolder(String(path ?? '')),
  'claudeCode:stop': (chatId: string) => stopClaude(String(chatId)),
  'claudeCode:openFolder': async (folder: string) => {
    if (typeof folder !== 'string' || !folder) return
    if (BROWSER_ONLY) return showInExplorer(folder)
    await shell.openPath(folder)
  },

  'reply:send': (req: SendRequest) => {
    const ctrl = new AbortController()
    running.set(req.requestId, ctrl)
    const id = req.requestId
    void reply(
      req,
      {
        onDelta: (text) => sendReply({ requestId: id, type: 'delta', text }),
        onActivity: (label) => sendReply({ requestId: id, type: 'activity', label }),
        onSource: (s) => sendReply({ requestId: id, type: 'source', url: s.url, title: s.title }),
        onToolRun: (run) => sendReply({ requestId: id, type: 'tool', run })
      },
      ctrl.signal
    )
      .then(() => sendReply({ requestId: req.requestId, type: 'done' }))
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) {
          sendReply({ requestId: req.requestId, type: 'error', code: 'stopped', message: 'Stopped.', usageLimit: false })
          return
        }
        const re = err instanceof ReplyError ? err : null
        sendReply({
          requestId: req.requestId,
          type: 'error',
          code: re?.code ?? 'error',
          message: err instanceof Error ? err.message : String(err),
          usageLimit: re?.usageLimit ?? false
        })
      })
      .finally(() => running.delete(req.requestId))
  },
  'reply:stop': (requestId: string) => running.get(requestId)?.abort(),

  'theme:set': (theme: 'light' | 'dark') => {
    if (theme !== 'light' && theme !== 'dark') return
    nativeTheme.themeSource = theme
    updateSettings({ theme })
    win?.setBackgroundColor(windowBackground())
  },

  openUsage: () => shell.openExternal(USAGE_URL),
  // PDF export (private: see @private/main/pdf)
  ...pdfHandlers(() => win, BROWSER_ONLY)
}

function registerIpc(): void {
  for (const [channel, fn] of Object.entries(handlers)) {
    ipcMain.handle(channel, (_e, ...args: unknown[]) => (fn as (...a: unknown[]) => unknown)(...args))
  }
  emitters.add((channel, payload) => win?.webContents.send(channel, payload))
  onSpeechStatus((s) => emit('speech:status', s))
  onPythonStatus((s) => emit('python:status', s))
}

const single = app.requestSingleInstanceLock()
if (!single) {
  if (BROWSER_ONLY) console.error('[plotter] Plotter is already open. Close the desktop Plotter window, then start the browser dev mode again.')
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
  void app.whenReady().then(() => {
    loadSession()
    allowMicrophone()
    protocol.handle('plotter-ui', (req) => {
      const id = new URL(req.url).pathname.replace(/^\//, '')
      const html = getUiFrame(id)
      if (!html) return new Response('Not found', { status: 404 })
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': UI_FRAME_CSP } })
    })
    registerIpc()
    if (process.env['ELECTRON_RENDERER_URL']) startDevBridge(handlers, (e) => emitters.add(e))
    if (!BROWSER_ONLY) createWindow()
  })
  app.on('before-quit', () => {
    stopAllClaude()
    void closeAllMarket()
  })
  app.on('window-all-closed', () => {
    if (!BROWSER_ONLY) app.quit()
  })
}
