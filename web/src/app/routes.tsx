// The route tree. Capture lives under /capture and review (M4b) will live elsewhere, so the rule
// that capture shows no analysis (ADR-0010) can be enforced by route and by import.

import type { RouteObject } from 'react-router'

import type { CaptureDeps } from '../capture/context.ts'
import { captureRoute } from '../capture/routes.tsx'
import { AppShell } from './AppShell.tsx'
import { Home } from './Home.tsx'
import { RouteError } from './RouteError.tsx'

/** The app's routes; tests pass `capture` to run the capture screens on a fake store and server. */
export function makeRoutes(capture?: CaptureDeps): RouteObject[] {
  return [
    {
      element: <AppShell />,
      children: [
        {
          errorElement: <RouteError />,
          children: [
            { index: true, element: <Home /> },
            captureRoute(capture),
            { path: '*', element: <RouteError /> },
          ],
        },
      ],
    },
  ]
}

export const routes: RouteObject[] = makeRoutes()
