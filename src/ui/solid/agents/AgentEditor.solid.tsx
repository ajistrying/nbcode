import chalk from 'chalk'
import figures from 'figures'
import { createSignal, createMemo, type JSX } from 'solid-js'
import { Show, For } from 'solid-js/web'
import { useSetAppState } from 'src/state/AppState.js'
import type { KeyboardEvent } from '../../../ink/events/keyboard-event.js'
import { useKeybinding } from '../../../keybindings/useKeybinding.js'
import type { Tools } from '../../../Tool.js'
import {
  type AgentColorName,
  setAgentColor,
} from '../../../tools/AgentTool/agentColorManager.js'
import {
  type AgentDefinition,
  getActiveAgentsFromList,
  isCustomAgent,
  isPluginAgent,
} from '../../../tools/AgentTool/loadAgentsDir.js'
import { editFileInEditor } from '../../../utils/promptEditor.js'
import { getActualAgentFilePath, updateAgentFile } from '../../components/agents/agentFileUtils.js'
import { ColorPicker } from './ColorPicker.solid.js'
import { ModelSelector } from '../../components/agents/ModelSelector.js'
import { ToolSelector } from '../../components/agents/ToolSelector.js'
import { getAgentSourceDisplayName } from '../../components/agents/utils.js'

type Props = {
  agent: AgentDefinition
  tools: Tools
  onSaved: (message: string) => void
  onBack: () => void
}

type EditMode = 'menu' | 'edit-tools' | 'edit-color' | 'edit-model'

type SaveChanges = {
  tools?: string[]
  color?: AgentColorName
  model?: string
}

export function AgentEditor(props: Props): JSX.Element {
  const setAppState = useSetAppState()
  const [editMode, setEditMode] = createSignal<EditMode>('menu')
  const [selectedMenuIndex, setSelectedMenuIndex] = createSignal(0)
  const [error, setError] = createSignal<string | null>(null)
  const [selectedColor, setSelectedColor] = createSignal<
    AgentColorName | undefined
  >(props.agent.color as AgentColorName | undefined)

  const handleOpenInEditor = async () => {
    const filePath = getActualAgentFilePath(props.agent)
    const result = await editFileInEditor(filePath)

    if (result.error) {
      setError(result.error)
    } else {
      props.onSaved(
        `Opened ${props.agent.agentType} in editor. If you made edits, restart to load the latest version.`,
      )
    }
  }

  const handleSave = async (changes: SaveChanges = {}) => {
    const { tools: newTools, color: newColor, model: newModel } = changes
    const finalColor = newColor ?? selectedColor()
    const hasToolsChanged = newTools !== undefined
    const hasModelChanged = newModel !== undefined
    const hasColorChanged = finalColor !== props.agent.color

    if (!hasToolsChanged && !hasModelChanged && !hasColorChanged) {
      return false
    }

    try {
      if (!isCustomAgent(props.agent) && !isPluginAgent(props.agent)) {
        return false
      }

      await updateAgentFile(
        props.agent,
        props.agent.whenToUse,
        newTools ?? props.agent.tools,
        props.agent.getSystemPrompt(),
        finalColor,
        newModel ?? props.agent.model,
      )

      if (hasColorChanged && finalColor) {
        setAgentColor(props.agent.agentType, finalColor)
      }

      setAppState(state => {
        const allAgents = state.agentDefinitions.allAgents.map(a =>
          a.agentType === props.agent.agentType
            ? {
                ...a,
                tools: newTools ?? a.tools,
                color: finalColor,
                model: newModel ?? a.model,
              }
            : a,
        )
        return {
          ...state,
          agentDefinitions: {
            ...state.agentDefinitions,
            activeAgents: getActiveAgentsFromList(allAgents),
            allAgents,
          },
        }
      })

      props.onSaved(`Updated agent: ${chalk.bold(props.agent.agentType)}`)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save agent')
      return false
    }
  }

  const menuItems = createMemo(() => [
    { label: 'Open in editor', action: handleOpenInEditor },
    { label: 'Edit tools', action: () => setEditMode('edit-tools') },
    { label: 'Edit model', action: () => setEditMode('edit-model') },
    { label: 'Edit color', action: () => setEditMode('edit-color') },
  ])

  const handleEscape = () => {
    setError(null)
    if (editMode() === 'menu') {
      props.onBack()
    } else {
      setEditMode('menu')
    }
  }

  const handleMenuKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'up') {
      e.preventDefault()
      setSelectedMenuIndex(index => Math.max(0, index - 1))
    } else if (e.key === 'down') {
      e.preventDefault()
      setSelectedMenuIndex(index => Math.min(menuItems().length - 1, index + 1))
    } else if (e.key === 'return') {
      e.preventDefault()
      const selectedItem = menuItems()[selectedMenuIndex()]
      if (selectedItem) {
        void selectedItem.action()
      }
    }
  }

  useKeybinding('confirm:no', handleEscape, { context: 'Confirmation' })

  const renderMenu = (): JSX.Element => (
    <box
      flexDirection="column"
      tabIndex={0}
      autoFocus
      onKeyDown={handleMenuKeyDown}
    >
      <text dimmed>Source: {getAgentSourceDisplayName(props.agent.source)}</text>

      <box marginTop={1} flexDirection="column">
        <For each={menuItems()}>
          {(item, index) => (
            <text
              fg={index() === selectedMenuIndex() ? 'suggestion' : undefined}
            >
              {index() === selectedMenuIndex() ? `${figures.pointer} ` : '  '}
              {item.label}
            </text>
          )}
        </For>
      </box>

      <Show when={error()}>
        <box marginTop={1}>
          <text fg="error">{error()}</text>
        </box>
      </Show>
    </box>
  )

  return (
    <>
      <Show when={editMode() === 'menu'}>
        {renderMenu()}
      </Show>
      <Show when={editMode() === 'edit-tools'}>
        <ToolSelector
          tools={props.tools}
          initialTools={props.agent.tools}
          onComplete={async (finalTools: string[]) => {
            setEditMode('menu')
            await handleSave({ tools: finalTools })
          }}
        />
      </Show>
      <Show when={editMode() === 'edit-color'}>
        <ColorPicker
          agentName={props.agent.agentType}
          currentColor={
            selectedColor() || (props.agent.color as AgentColorName) || 'automatic'
          }
          onConfirm={async (color: AgentColorName) => {
            setSelectedColor(color)
            setEditMode('menu')
            await handleSave({ color })
          }}
        />
      </Show>
      <Show when={editMode() === 'edit-model'}>
        <ModelSelector
          initialModel={props.agent.model}
          onComplete={async (model: string) => {
            setEditMode('menu')
            await handleSave({ model })
          }}
        />
      </Show>
    </>
  )
}
