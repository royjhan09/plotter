import type { PlotterApi } from '../../shared/api'

declare global {
  interface Window {
    plotter: PlotterApi
  }
}

