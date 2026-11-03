from review import engine


def test_engine_version_comes_from_rust() -> None:
    version = engine.engine_version()
    assert version.startswith("solver ")
    assert "(cards " in version
