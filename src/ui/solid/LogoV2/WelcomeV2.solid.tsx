/**
 * Welcome screen with ASCII art logo.
 *
 * SolidJS + OpenTUI port of src/components/LogoV2/WelcomeV2.tsx.
 *
 * This is a large static/presentational component. The ASCII art rows
 * are rendered directly. Theme-dependent branching for light themes
 * and Apple Terminal is preserved.
 */

import { Show } from 'solid-js'
import type { JSX } from '@opentui/solid'
import { env } from '../../../utils/env.js'
import { useTheme } from '../design-system/ThemeProvider.solid.js'

const WELCOME_V2_WIDTH = 58

export function WelcomeV2() {
  const [theme] = useTheme()

  const isLightTheme = () =>
    ['light', 'light-daltonized', 'light-ansi'].includes(theme())

  return (
    <Show
      when={env.terminal !== 'Apple_Terminal'}
      fallback={
        <AppleTerminalWelcomeV2 theme={theme()} welcomeMessage="Welcome to Noble Base Code" />
      }
    >
      <Show when={!isLightTheme()} fallback={<LightThemeWelcome />}>
        <DarkThemeWelcome />
      </Show>
    </Show>
  )
}

function LightThemeWelcome() {
  return (
    <box width={WELCOME_V2_WIDTH}>
      <text>
        <text>
          <text fg="startupAccent">{"Welcome to Noble Base Code"} </text>
          <text dimmed>v{MACRO.VERSION} </text>
        </text>
        <text>{"\u2026".repeat(58)}</text>
        <text>{"                                                          "}</text>
        <text>{"                                                          "}</text>
        <text>{"                                                          "}</text>
        <text>{"            \u2591\u2591\u2591\u2591\u2591\u2591                                        "}</text>
        <text>{"    \u2591\u2591\u2591   \u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591                                      "}</text>
        <text>{"   \u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591                                    "}</text>
        <text>{"                                                          "}</text>
        <text>
          <text dimmed>{"                           \u2591\u2591\u2591\u2591"}</text>
          <text>{"                     \u2588\u2588    "}</text>
        </text>
        <text>
          <text dimmed>{"                         \u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591"}</text>
          <text>{"               \u2588\u2588\u2592\u2592\u2588\u2588  "}</text>
        </text>
        <text>{"                                            \u2592\u2592      \u2588\u2588   \u2592"}</text>
        <text>{"      "}<text fg="clawd_body"> \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588 </text>{"                         \u2592\u2592\u2591\u2591\u2592\u2592      \u2592 \u2592\u2592"}</text>
        <text>{"      "}<text fg="clawd_body" bg="clawd_background">{"\u2588\u2588\u2584\u2588\u2588\u2588\u2588\u2588\u2584\u2588\u2588"}</text>{"                           \u2592\u2592         \u2592\u2592 "}</text>
        <text>{"      "}<text fg="clawd_body"> \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588 </text>{"                          \u2591          \u2592   "}</text>
        <text>{"\u2026\u2026\u2026\u2026\u2026\u2026\u2026"}<text fg="clawd_body">{"\u2588 \u2588   \u2588 \u2588"}</text>{"\u2026".repeat(42)}</text>
      </text>
    </box>
  )
}

function DarkThemeWelcome() {
  return (
    <box width={WELCOME_V2_WIDTH}>
      <text>
        <text>
          <text fg="startupAccent">{"Welcome to Noble Base Code"} </text>
          <text dimmed>v{MACRO.VERSION} </text>
        </text>
        <text>{"\u2026".repeat(58)}</text>
        <text>{"                                                          "}</text>
        <text>{"     *                                       \u2588\u2588\u2588\u2588\u2588\u2593\u2593\u2591     "}</text>
        <text>{"                                 *         \u2588\u2588\u2588\u2593\u2591     \u2591\u2591   "}</text>
        <text>{"            \u2591\u2591\u2591\u2591\u2591\u2591                        \u2588\u2588\u2588\u2593\u2591           "}</text>
        <text>{"    \u2591\u2591\u2591   \u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591                      \u2588\u2588\u2588\u2593\u2591           "}</text>
        <text>
          <text>{"   \u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591    "}</text>
          <text><b>*</b></text>
          <text>{"                \u2588\u2588\u2593\u2591\u2591      \u2593   "}</text>
        </text>
        <text>{"                                             \u2591\u2593\u2593\u2588\u2588\u2588\u2593\u2593\u2591    "}</text>
        <text dimmed>{" *                                 \u2591\u2591\u2591\u2591                   "}</text>
        <text dimmed>{"                                 \u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591                 "}</text>
        <text dimmed>{"                               \u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591           "}</text>
        <text>{"      "}<text fg="clawd_body"> \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588 </text>{"                                       "}<text dimmed>*</text><text> </text></text>
        <text>{"      "}<text fg="clawd_body">{"\u2588\u2588\u2584\u2588\u2588\u2588\u2588\u2588\u2584\u2588\u2588"}</text><text>{"                        "}</text><text><b>*</b></text><text>{"                "}</text></text>
        <text>{"      "}<text fg="clawd_body"> \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588 </text>{"     *                                   "}</text>
        <text>{"\u2026\u2026\u2026\u2026\u2026\u2026\u2026"}<text fg="clawd_body">{"\u2588 \u2588   \u2588 \u2588"}</text>{"\u2026".repeat(42)}</text>
      </text>
    </box>
  )
}

interface AppleTerminalWelcomeV2Props {
  theme: string
  welcomeMessage: string
}

function AppleTerminalWelcomeV2(props: AppleTerminalWelcomeV2Props) {
  const isLightTheme = () =>
    ['light', 'light-daltonized', 'light-ansi'].includes(props.theme)

  // The Apple Terminal variant is very similar to the standard one,
  // but uses background-color tricks because Apple Terminal renders
  // vertical space between chars by default but not between bg colors.
  // For brevity we render the same structure with the light/dark branching.
  return (
    <Show when={!isLightTheme()} fallback={<AppleTerminalLight welcomeMessage={props.welcomeMessage} />}>
      <AppleTerminalDark welcomeMessage={props.welcomeMessage} />
    </Show>
  )
}

function AppleTerminalLight(props: { welcomeMessage: string }) {
  return (
    <box width={WELCOME_V2_WIDTH}>
      <text>
        <text>
          <text fg="startupAccent">{props.welcomeMessage} </text>
          <text dimmed>v{MACRO.VERSION} </text>
        </text>
        <text>{"\u2026".repeat(58)}</text>
        <text>{"                                                          "}</text>
        <text>{"                                                          "}</text>
        <text>{"                                                          "}</text>
        <text>{"            \u2591\u2591\u2591\u2591\u2591\u2591                                        "}</text>
        <text>{"    \u2591\u2591\u2591   \u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591                                      "}</text>
        <text>{"   \u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591                                    "}</text>
        <text>{"                                                          "}</text>
        <text>
          <text dimmed>{"                           \u2591\u2591\u2591\u2591"}</text>
          <text>{"                     \u2588\u2588    "}</text>
        </text>
        <text>
          <text dimmed>{"                         \u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591"}</text>
          <text>{"               \u2588\u2588\u2592\u2592\u2588\u2588  "}</text>
        </text>
        <text>{"                                            \u2592\u2592      \u2588\u2588   \u2592"}</text>
        <text>{"                                          \u2592\u2592\u2591\u2591\u2592\u2592      \u2592 \u2592\u2592"}</text>
        <text>{"      "}<text fg="clawd_body">{"\u2597"}</text><text fg="clawd_background" bg="clawd_body">{" \u2597     \u2596 "}</text><text fg="clawd_body">{"\u2596"}</text>{"                           \u2592\u2592         \u2592\u2592 "}</text>
        <text>{"      "}<text bg="clawd_body">{"         "}</text>{"                          \u2591          \u2592   "}</text>
        <text>{"      "}<text fg="clawd_body">{"\u2598\u2598 \u259D\u259D"}</text>{"                                               "}</text>
        <text>{"\u2026".repeat(58)}</text>
      </text>
    </box>
  )
}

function AppleTerminalDark(props: { welcomeMessage: string }) {
  return (
    <box width={WELCOME_V2_WIDTH}>
      <text>
        <text>
          <text fg="startupAccent">{props.welcomeMessage} </text>
          <text dimmed>v{MACRO.VERSION} </text>
        </text>
        <text>{"\u2026".repeat(58)}</text>
        <text>{"                                                          "}</text>
        <text>{"     *                                       \u2588\u2588\u2588\u2588\u2588\u2593\u2593\u2591     "}</text>
        <text>{"                                 *         \u2588\u2588\u2588\u2593\u2591     \u2591\u2591   "}</text>
        <text>{"            \u2591\u2591\u2591\u2591\u2591\u2591                        \u2588\u2588\u2588\u2593\u2591           "}</text>
        <text>{"    \u2591\u2591\u2591   \u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591                      \u2588\u2588\u2588\u2593\u2591           "}</text>
        <text>
          <text>{"   \u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591    "}</text>
          <text><b>*</b></text>
          <text>{"                \u2588\u2588\u2593\u2591\u2591      \u2593   "}</text>
        </text>
        <text>{"                                             \u2591\u2593\u2593\u2588\u2588\u2588\u2593\u2593\u2591    "}</text>
        <text dimmed>{" *                                 \u2591\u2591\u2591\u2591                   "}</text>
        <text dimmed>{"                                 \u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591                 "}</text>
        <text dimmed>{"                               \u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591           "}</text>
        <text>{"      "}<text fg="clawd_body">{"\u2597"}</text><text fg="clawd_background" bg="clawd_body">{" \u2597     \u2596 "}</text><text fg="clawd_body">{"\u2596"}</text>{"                                       "}<text dimmed>*</text><text> </text></text>
        <text>{"      "}<text bg="clawd_body">{"         "}</text><text>{"                        "}</text><text><b>*</b></text><text>{"                "}</text></text>
        <text>{"      "}<text fg="clawd_body">{"\u2598\u2598 \u259D\u259D"}</text>{"     *                                   "}</text>
        <text>{"\u2026".repeat(58)}</text>
      </text>
    </box>
  )
}
