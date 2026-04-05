/**
 * Theme provider for SolidJS + OpenTUI.
 *
 * Reuses the existing theme utilities (src/utils/theme.ts) which are
 * framework-agnostic. Only the context delivery changes from React to Solid.
 */

import { createContext, createSignal, useContext } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { getTheme, type Theme, type ThemeName, type ThemeSetting } from '../../../utils/theme.js'
import { getGlobalConfig, saveGlobalConfig } from '../../../utils/config.js'

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface ThemeContextValue {
  themeSetting: () => ThemeSetting
  setThemeSetting: (setting: ThemeSetting) => void
  currentTheme: () => ThemeName
  theme: () => Theme
}

const DEFAULT_THEME: ThemeName = 'dark'

const ThemeContext = createContext<ThemeContextValue>({
  themeSetting: () => DEFAULT_THEME,
  setThemeSetting: () => {},
  currentTheme: () => DEFAULT_THEME,
  theme: () => getTheme(DEFAULT_THEME),
})

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface ThemeProviderProps {
  initialTheme?: ThemeSetting
  children?: JSX.Element
}

export function ThemeProvider(props: ThemeProviderProps) {
  const initial = props.initialTheme ?? getGlobalConfig().theme ?? DEFAULT_THEME

  const [themeSetting, setThemeSettingRaw] = createSignal<ThemeSetting>(initial)

  // Resolve 'auto' to a concrete theme name
  const currentTheme = (): ThemeName => {
    const setting = themeSetting()
    if (setting === 'auto') return DEFAULT_THEME // simplified; full version checks system theme
    return setting as ThemeName
  }

  const theme = () => getTheme(currentTheme())

  const setThemeSetting = (setting: ThemeSetting) => {
    setThemeSettingRaw(setting)
    saveGlobalConfig((current) => ({ ...current, theme: setting }))
  }

  const value: ThemeContextValue = {
    themeSetting,
    setThemeSetting,
    currentTheme,
    theme,
  }

  return (
    <ThemeContext.Provider value={value}>
      {props.children}
    </ThemeContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTheme(): [() => ThemeName, (s: ThemeSetting) => void] {
  const ctx = useContext(ThemeContext)
  return [ctx.currentTheme, ctx.setThemeSetting]
}

export function useThemeColors(): () => Theme {
  const ctx = useContext(ThemeContext)
  return ctx.theme
}

/**
 * Resolve a color that may be a theme key to a raw hex color.
 */
export function resolveColor(
  color: keyof Theme | string | undefined,
  theme: Theme,
): string | undefined {
  if (!color) return undefined
  // Raw color values pass through
  if (color.startsWith('rgb(') || color.startsWith('#') || color.startsWith('ansi')) {
    return color
  }
  // Theme key — look it up
  return theme[color as keyof Theme] as string
}
