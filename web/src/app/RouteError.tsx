import { isRouteErrorResponse, useRouteError } from 'react-router'

import { ButtonLink } from '../design/Button.tsx'

export function RouteError() {
  const error = useRouteError()
  // Rendered for unknown paths too (the '*' route), where there is no error object.
  const notFound =
    error === undefined || error === null || (isRouteErrorResponse(error) && error.status === 404)
  return (
    <>
      <h1>{notFound ? 'Not found' : 'Something went wrong'}</h1>
      <p>{notFound ? 'There is no page at this address.' : describe(error)}</p>
      <ButtonLink to="/">Home</ButtonLink>
    </>
  )
}

function describe(error: unknown): string {
  if (isRouteErrorResponse(error)) return `${String(error.status)} ${error.statusText}`
  return error instanceof Error ? error.message : 'Unknown error'
}
