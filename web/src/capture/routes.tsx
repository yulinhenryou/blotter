// The capture routes (docs/CAPTURE.md §1), all under /capture. They never request or show analysis
// (ADR-0010): the only server calls are sync and the venue and player lists.

import type { RouteObject } from 'react-router'

import { CaptureHome } from './CaptureHome.tsx'
import { CaptureRoot } from './CaptureRoot.tsx'
import type { CaptureDeps } from './context.ts'
import { EntryTimes } from './EntryTimes.tsx'
import { HandPage } from './HandPage.tsx'
import { NeedsAttention } from './NeedsAttention.tsx'
import { NewSession } from './NewSession.tsx'
import { SessionPage } from './SessionPage.tsx'
import { SessionSettings } from './SessionSettings.tsx'

/** The `/capture` route tree; `deps` replaces the store, server and clock in tests. */
export function captureRoute(deps?: CaptureDeps): RouteObject {
  return {
    path: 'capture',
    element: <CaptureRoot deps={deps} />,
    children: [
      { index: true, element: <CaptureHome /> },
      { path: 'session/new', element: <NewSession /> },
      { path: 'session/:sessionId', element: <SessionPage /> },
      { path: 'session/:sessionId/settings', element: <SessionSettings /> },
      { path: 'hand/:handId', element: <HandPage /> },
      { path: 'attention', element: <NeedsAttention /> },
      { path: 'times', element: <EntryTimes /> },
    ],
  }
}
