from hypothesis import settings

# Fixed seeds for every property test (CLAUDE.md §8): derandomized generation, no example
# database, so a run is the same on every machine.
settings.register_profile("fixed", derandomize=True, database=None, deadline=None)
settings.load_profile("fixed")
