import { useEffect, useState } from 'react'

/** Light or dark, remembered on this computer. Before the first choice, start from Windows' setting. */

export type Theme = 'light' | 'dark'

const KEY = 'plotter.theme'
const EVENT = 'plotter-theme'

export function savedTheme(): Theme {
  const v = localStorage.getItem(KEY)
  if (v === 'light' || v === 'dark') return v
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export const currentTheme = (): Theme => (document.documentElement.dataset['theme'] === 'dark' ? 'dark' : 'light')

/** Sets the page's theme now (call before the first render to avoid a flash). */
export function applyTheme(theme: Theme = savedTheme()): void {
  if (document.documentElement.dataset['theme'] !== theme) {
    document.documentElement.dataset['theme'] = theme
    window.dispatchEvent(new CustomEvent(EVENT, { detail: theme }))
  }
}

/** The current theme, re-rendering when it changes (for charts and diagrams). */
export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(currentTheme)
  useEffect(() => {
    const on = (e: Event): void => setTheme((e as CustomEvent<Theme>).detail)
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])
  return theme
}

/** The theme plus a setter that applies, remembers, and tells the window frame. */
export function useThemeSetting(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(savedTheme)
  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem(KEY, theme)
    void window.plotter.setTheme(theme)
  }, [theme])
  return [theme, setTheme]
}

/** Claude Code chats have their own light/dark choice, dark unless changed (shared by every Claude Code side). */
const CC_KEY = 'plotter.ccTheme'
const CC_EVENT = 'plotter-cc-theme'
export function useClaudeTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(() => (localStorage.getItem(CC_KEY) === 'light' ? 'light' : 'dark'))
  useEffect(() => {
    const on = (e: Event): void => setThemeState((e as CustomEvent<Theme>).detail)
    window.addEventListener(CC_EVENT, on)
    return () => window.removeEventListener(CC_EVENT, on)
  }, [])
  const set = (t: Theme): void => {
    localStorage.setItem(CC_KEY, t)
    window.dispatchEvent(new CustomEvent(CC_EVENT, { detail: t }))
  }
  return [theme, set]
}
