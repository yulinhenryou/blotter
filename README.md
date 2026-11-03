# Blotter

**A trading blotter for your poker decisions.**

> Status: **early development.** This repository currently contains design documents only. No
> features are implemented yet. "Blotter" is a working name and may change.

Traders record every trade on a blotter and later attribute their P&L: how much came from real
edge, and how much from noise. This project aims to do the same for poker decisions — record each
decision, price it in big blinds of expected value, separate decision quality from card variance,
and draw conclusions only when the statistics support them.

It is not meant to be another GTO solver. A small solver engine (heads-up turn and river spots)
will serve as the EV engine underneath; the focus is statistical attribution and honest
measurement of decision quality.

## Intended scope

The design is organized around five ideas, described in [docs/VISION.md](docs/VISION.md):

1. **Decision ledger** — each decision recorded like a trade, with the EV of each available action
   and the EV lost by the action taken.
2. **Luck/skill attribution** — results split into decision EV and card variance, based on
   published methods.
3. **Statistically honest leak detection** — shrinkage estimates, multiple-comparison control, and
   an explicit "insufficient evidence" answer.
4. **Calibration training** — commit a judgment before seeing the model's answer; track how
   well-calibrated intuition is over time.
5. **Risk-aware exploitation and bankroll** — opponent models and bankroll guidance that carry their
   uncertainty into every recommendation.

It is designed live-first: quick phone entry of key hands, tolerant of incomplete information.

None of this exists yet. See the [roadmap](docs/ROADMAP.md) for the planned order of work and the
acceptance criteria for each milestone.

## Post-game only

This project is for **review and learning after play**. It does not provide, and is not designed
for, real-time assistance during a hand. Please respect the rules of the venues and sites where
you play.

## Documentation

- [Vision](docs/VISION.md) — goals, users, pillars, non-goals
- [Architecture](docs/ARCHITECTURE.md) — layers, interfaces, data model, technology choices
- [Mathematical models](docs/MATH.md) — outline of the game theory and statistics, with references
- [Roadmap](docs/ROADMAP.md) — milestones and acceptance criteria
- [Decisions](docs/DECISIONS.md) — architecture decision records

## Planned technology

Rust (solver engine), Python (statistics and API, via PyO3), TypeScript + React (web app),
SQLite. Details and rationale in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## License

The project will be dual-licensed under the MIT License or the Apache License 2.0, at your option.
The license files are added in milestone M0; until they are in the repository, all rights are
reserved.
