import type { JSX } from '@opentui/solid'
import { createSignal, Show } from 'solid-js'
import { onMount } from 'solid-js'
import {
  getAllOutputStyles,
  OUTPUT_STYLE_CONFIG,
  type OutputStyleConfig,
} from '../../../constants/outputStyles.js'
import type { OutputStyle } from '../../../utils/config.js'
import { getCwd } from '../../../utils/cwd.js'
import type { OptionWithDescription } from '../../components/CustomSelect/select.js'
import { Select } from '../../components/CustomSelect/select.js'
import { Dialog } from '../../components/design-system/Dialog.js'

const DEFAULT_OUTPUT_STYLE_LABEL = 'Default'
const DEFAULT_OUTPUT_STYLE_DESCRIPTION =
  'Claude completes coding tasks efficiently and provides concise responses'

function mapConfigsToOptions(styles: {
  [styleName: string]: OutputStyleConfig | null
}): OptionWithDescription[] {
  return Object.entries(styles).map(([style, config]) => ({
    label: config?.name ?? DEFAULT_OUTPUT_STYLE_LABEL,
    value: style,
    description: config?.description ?? DEFAULT_OUTPUT_STYLE_DESCRIPTION,
  }))
}

export type OutputStylePickerProps = {
  initialStyle: OutputStyle
  onComplete: (style: OutputStyle) => void
  onCancel: () => void
  isStandaloneCommand?: boolean
}

export function OutputStylePicker(props: OutputStylePickerProps): JSX.Element {
  const [styleOptions, setStyleOptions] = createSignal<OptionWithDescription[]>([])
  const [isLoading, setIsLoading] = createSignal(true)

  onMount(() => {
    getAllOutputStyles(getCwd())
      .then(allStyles => {
        const options = mapConfigsToOptions(allStyles)
        setStyleOptions(options)
        setIsLoading(false)
      })
      .catch(() => {
        const builtInOptions = mapConfigsToOptions(OUTPUT_STYLE_CONFIG)
        setStyleOptions(builtInOptions)
        setIsLoading(false)
      })
  })

  const handleStyleSelect = (style: string) => {
    const outputStyle = style as OutputStyle
    props.onComplete(outputStyle)
  }

  return (
    <Dialog
      title="Preferred output style"
      onCancel={props.onCancel}
      hideInputGuide={!props.isStandaloneCommand}
      hideBorder={!props.isStandaloneCommand}
    >
      <box flexDirection="column" gap={1}>
        <box marginTop={1}>
          <text dimmed>
            This changes how Claude Code communicates with you
          </text>
        </box>
        <Show
          when={!isLoading()}
          fallback={<text dimmed>Loading output styles...</text>}
        >
          <Select
            options={styleOptions()}
            onChange={handleStyleSelect}
            visibleOptionCount={10}
            defaultValue={props.initialStyle}
          />
        </Show>
      </box>
    </Dialog>
  )
}
