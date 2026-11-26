import { useEffect, useState } from 'react'

/** Light / dark: follow Windows ("system") or a fixed choice, remembered on this computer. */

export type ThemeChoice = 'system' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

const KEY = 'plotter.theme'
const EVENT = 'plotter-theme'
const media = (): MediaQueryList => window.matchMedia('(prefers-color-scheme: dark)')

export function savedChoice(): ThemeChoice {
  const v = localStorage.getItem(KEY)
  return v === 'light' || v === 'dark' ? v : 'system'
}

function resolve(choice: ThemeChoice): Theme {
  return choice === 'system' ? (media().matches ? 'dark' : 'light') : choice
}

export const currentTheme = (): Theme => (document.documentElement.dataset['theme'] === 'dark' ? 'dark' : 'light')

/** Sets the page's theme now (call before the first render to avoid a flash). */
export function applyTheme(choice: ThemeChoice = savedChoice()): void {
  const theme = resolve(choice)
  if (document.documentElement.dataset['theme'] !== theme) {
    document.documentElement.dataset['theme'] = theme
    window.dispatchEvent(new CustomEvent(EVENT, { detail: theme }))
  }
}

/** The resolved theme, re-rendering when it changes (for charts and diagrams). */
export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(currentTheme)
  useEffect(() => {
    const on = (e: Event): void => setTheme((e as CustomEvent<Theme>).detail)
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])
  return theme
}

/** The user's choice plus a setter; also follows Windows while the choice is "system". */
export function useThemeChoice(): [ThemeChoice, (c: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>(savedChoice)
  useEffect(() => {
    applyTheme(choice)
    localStorage.setItem(KEY, choice)
    void window.plotter.setTheme(choice)
    if (choice !== 'system') return
    const m = media()
    const on = (): void => applyTheme('system')
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [choice])
  return [choice, setChoice]
}
