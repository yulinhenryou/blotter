"""Typed access to the Rust engine.

This is the only module that imports the native extension ``review._engine``; everything else
in the package goes through the functions defined here.
"""

from review import _engine


def engine_version() -> str:
    """Return the engine version reported by the Rust crates.

    Returns
    -------
    str
        For example ``"solver 0.0.0 (cards 0.0.0)"``.
    """
    return _engine.version()
