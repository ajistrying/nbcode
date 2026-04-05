import type { JSX } from '@opentui/solid'
import { FpsMetricsProvider } from '../../../context/fpsMetrics.js'
import { StatsProvider, type StatsStore } from '../../../context/stats.js'
import { type AppState, AppStateProvider } from '../../../state/AppState.js'
import { onChangeAppState } from '../../../state/onChangeAppState.js'
import type { FpsMetrics } from '../../../utils/fpsTracker.js'

type Props = {
  getFpsMetrics: () => FpsMetrics | undefined
  stats?: StatsStore
  initialState: AppState
  children: JSX.Element
}

/**
 * Top-level wrapper for interactive sessions.
 * Provides FPS metrics, stats context, and app state to the component tree.
 */
export function AppWrapper(props: Props): JSX.Element {
  return (
    <FpsMetricsProvider getFpsMetrics={props.getFpsMetrics}>
      <StatsProvider store={props.stats}>
        <AppStateProvider
          initialState={props.initialState}
          onChangeAppState={onChangeAppState}
        >
          {props.children}
        </AppStateProvider>
      </StatsProvider>
    </FpsMetricsProvider>
  )
}
