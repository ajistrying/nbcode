import type { JSX } from '@opentui/solid'
import type { Theme } from '../../../utils/theme.js'
import { PermissionRequestTitle } from './PermissionRequestTitle.solid.js'
import type { WorkerBadgeProps } from './WorkerBadge.solid.js'

type Props = {
  title: string
  subtitle?: JSX.Element
  color?: keyof Theme
  titleColor?: keyof Theme
  innerPaddingX?: number
  workerBadge?: WorkerBadgeProps
  titleRight?: JSX.Element
  children: JSX.Element
}

export function PermissionDialog(props: Props): JSX.Element {
  const color = () => props.color ?? 'permission'
  const innerPaddingX = () => props.innerPaddingX ?? 1

  return (
    <box
      flexDirection="column"
      borderStyle="round"
      borderColor={color()}
      borderLeft={false}
      borderRight={false}
      borderBottom={false}
      marginTop={1}
    >
      <box paddingX={1} flexDirection="column">
        <box justifyContent="space-between">
          <PermissionRequestTitle
            title={props.title}
            subtitle={props.subtitle}
            color={props.titleColor}
            workerBadge={props.workerBadge}
          />
          {props.titleRight}
        </box>
      </box>
      <box flexDirection="column" paddingX={innerPaddingX()}>
        {props.children}
      </box>
    </box>
  )
}
