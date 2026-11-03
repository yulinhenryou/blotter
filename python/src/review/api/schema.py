"""OpenAPI schema export.

The schema is committed at ``web/openapi.json`` and is the contract between the API and the web
app: TypeScript types are generated from it. A test fails when the committed file is stale.
"""

import json

from review.api.app import create_app


def openapi_json() -> str:
    """Return the OpenAPI schema as deterministic, pretty-printed JSON.

    Returns
    -------
    str
        The schema with sorted keys, two-space indentation and a trailing newline.
    """
    return json.dumps(create_app().openapi(), indent=2, sort_keys=True) + "\n"
