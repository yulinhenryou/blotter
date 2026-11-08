// The route tree. Capture lives under /capture and review (M4b) will live elsewhere, so the rule
// that capture shows no analysis (ADR-0010) can be enforced by route and by import.

import type { RouteObject } from 'react-router'

import { CaptureHome } from '../capture/CaptureHome.tsx'
import { AppShell } from './AppShell.tsx'
import { Home } from './Home.tsx'
import { RouteError } from './RouteError.tsx'

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      {
        errorElement: <RouteError />,
        children: [
          { index: true, element: <Home /> },
          { path: 'capture', element: <CaptureHome /> },
          { path: '*', element: <RouteError /> },
        ],
      },
    ],
  },
]
