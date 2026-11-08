"""Venues, sessions and players as the phone syncs them (``docs/ARCHITECTURE.md`` §7.2).

Like :class:`review.domain.record.HandRecord`, each carries a client-generated UUIDv7 and a
``revision`` that the client increments on every edit (sync semantics: ADR-0026). The models are
frozen and forbid unknown fields, for the same reasons as the hand record.
"""

from enum import StrEnum
from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import (
    UUID7,
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    ValidationInfo,
    field_validator,
)

Revision = Annotated[int, Field(ge=1)]
Chips = Annotated[int, Field(ge=0)]
PositiveChips = Annotated[int, Field(ge=1)]
Name = Annotated[str, Field(min_length=1, max_length=200)]


class _Model(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class VenueKind(StrEnum):
    """Where a session is played."""

    LIVE = "live"
    ONLINE = "online"


class VenueRecord(_Model):
    """A card room or an online site."""

    id: UUID7
    revision: Revision = 1
    name: Name
    kind: VenueKind
    timezone: Annotated[str, Field(max_length=64, examples=["Europe/Vienna"])]
    """An IANA time-zone name."""

    @field_validator("timezone")
    @classmethod
    def _known_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as error:
            raise ValueError(f"unknown IANA time zone {value!r}") from error
        return value


class PlayerRecord(_Model):
    """Hero or a known opponent. Anonymous seats have no player."""

    id: UUID7
    revision: Revision = 1
    display_name: Name
    is_hero: bool = False
    notes: str | None = None


class SessionRecord(_Model):
    """A playing session at one stake. Results come from buy-in and cash-out (``MATH.md`` §4.5)."""

    id: UUID7
    revision: Revision = 1
    venue_id: UUID7 | None = None
    started_at: AwareDatetime
    ended_at: AwareDatetime | None = None
    small_blind_chips: PositiveChips
    big_blind_chips: PositiveChips
    currency: Annotated[str | None, Field(pattern=r"^[A-Z]{3}$", examples=["EUR"])] = None
    """ISO 4217 code."""
    chip_unit_minor: Annotated[int | None, Field(ge=1)] = None
    """Value of one chip in the currency's minor unit (cents for EUR)."""
    buy_in_chips: Chips | None = None
    cash_out_chips: Chips | None = None
    notes: str | None = None

    @field_validator("ended_at")
    @classmethod
    def _ends_after_start(
        cls, value: AwareDatetime | None, info: ValidationInfo
    ) -> AwareDatetime | None:
        started = info.data.get("started_at")
        if value is not None and started is not None and value < started:
            raise ValueError("a session cannot end before it starts")
        return value

    @field_validator("big_blind_chips")
    @classmethod
    def _blinds_in_order(cls, value: int, info: ValidationInfo) -> int:
        small = info.data.get("small_blind_chips")
        if small is not None and small > value:
            raise ValueError("the small blind cannot be larger than the big blind")
        return value
