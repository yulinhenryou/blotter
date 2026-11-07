"""JSON Schema of the hand record.

The schema is committed at ``web/hand-record.schema.json`` for the web app, which validates
records offline before they are synced (M4a). A test fails when the committed file is stale.
"""

import json

from review.domain.record import HandRecord


def hand_record_schema_json() -> str:
    """Return the JSON Schema of :class:`HandRecord` as deterministic, pretty-printed JSON.

    Returns
    -------
    str
        The schema with sorted keys, two-space indentation and a trailing newline.
    """
    return json.dumps(HandRecord.model_json_schema(), indent=2, sort_keys=True) + "\n"
