import { createSignal, Show, For, type JSXElement } from 'solid-js'
import {
  AGENT_COLORS,
  AGENT_COLOR_TO_THEME_COLOR,
  type AgentColorName,
} from '../../../tools/AgentTool/agentColorManager.js'
import { Select } from '../../solid/components/CustomSelect/index.js'
import type { Theme } from '../../../utils/theme.js'

type Props = {
  currentColor?: AgentColorName
  onSelect: (color: AgentColorName) => void
  onCancel?: () => void
}

export function ColorPicker(props: Props): JSXElement {
  const [selectedColor, setSelectedColor] = createSignal<AgentColorName | undefined>(
    props.currentColor,
  )

  const options = AGENT_COLORS.map((color) => ({
    label: (
      <text fg={AGENT_COLOR_TO_THEME_COLOR[color]}>
        {'\u2588\u2588'} {color}
      </text>
    ),
    value: color,
  }))

  const handleChange = (value: string) => {
    const color = value as AgentColorName
    setSelectedColor(color)
    props.onSelect(color)
  }

  return (
    <box flexDirection="column">
      <text><b>Choose a color:</b></text>
      <Select
        options={options}
        onChange={handleChange}
        onCancel={props.onCancel}
      />
    </box>
  )
}
