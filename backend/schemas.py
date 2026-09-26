"""Response models for the public API.

Fields are required (no defaults) so a service that stops returning a key
fails loudly instead of silently vanishing from the response, and so the
generated OpenAPI schema (and the frontend types built from it) marks every
field as always present. ``None`` is allowed wherever FastF1 data can be
missing.
"""

from typing import Literal

from pydantic import BaseModel


class Health(BaseModel):
    status: str


class Seasons(BaseModel):
    seasons: list[int]


class Race(BaseModel):
    round: int | None
    name: str
    official_name: str | None
    location: str | None
    country: str | None
    date: str


class Races(BaseModel):
    year: int
    races: list[Race]


class SessionInfo(BaseModel):
    name: str
    key: str
    date: str | None
    type: Literal["race_pace", "qualifying", "unknown"]


class Sessions(BaseModel):
    year: int
    race: str
    sessions: list[SessionInfo]


class Driver(BaseModel):
    code: str
    number: str | None
    full_name: str | None
    team: str | None


class Drivers(BaseModel):
    year: int
    race: str
    session: str
    drivers: list[Driver]


class EventSummary(BaseModel):
    year: int
    name: str | None
    official_name: str | None
    round: int | None
    circuit: str | None
    country: str | None


class SessionSummary(BaseModel):
    name: str | None
    type: Literal["race_pace", "qualifying", "unknown"]
    date: str


LapClassification = Literal["unknown", "deleted_lap", "out_lap", "in_lap", "slow_lap", "push_lap"]


class LapSummary(BaseModel):
    driver: str
    driver_number: str | None
    team: str | None
    lap_number: int
    lap_time_seconds: float | None
    sector_1_seconds: float | None
    sector_2_seconds: float | None
    sector_3_seconds: float | None
    compound: str | None
    tyre_life: float | None
    fresh_tyres: bool | None
    stint: int | None
    pit_in: bool
    pit_out: bool
    deleted: bool
    top_speed: float | None
    classification: LapClassification


class RankedLap(LapSummary):
    position: int
    gap_to_fastest: float


class QualifyingAttempt(LapSummary):
    gap_to_session_best: float
    segment: str | None
    gap_to_segment_best: float | None


class TopSpeed(BaseModel):
    driver: str
    top_speed: float
    lap_number: int


class TyreStint(BaseModel):
    driver: str | None
    stint: int | None
    compound: str | None
    lap_count: int
    tyre_life_start: float | None
    tyre_life_end: float | None


ExclusionReason = Literal["slower_than_107_percent_of_stint_best", "slower_than_stint_trend", "faster_than_stint_trend"]


class ExcludedLap(BaseModel):
    lap_number: int
    reason: ExclusionReason


class LongRunLap(BaseModel):
    lap_number: int
    lap_time_seconds: float
    tyre_life: float | None
    default_included: bool
    exclusion_reason: ExclusionReason | None


class LongRun(BaseModel):
    run_id: str
    driver: str
    stint: int
    compound: str
    lap_count: int
    average_pace_seconds: float
    median_pace_seconds: float
    best_lap_seconds: float
    worst_lap_seconds: float
    pace_dropoff_per_lap: float | None
    tyre_degradation_per_lap: float | None
    tyre_life_start: float | None
    tyre_life_end: float | None
    laps_used: list[int]
    laps_excluded: list[ExcludedLap]
    laps: list[LongRunLap]


class SessionAnalysis(BaseModel):
    event: EventSummary
    session: SessionSummary
    drivers: list[Driver]
    fastest_laps: list[RankedLap]
    top_speeds: list[TopSpeed]
    long_runs: list[LongRun]
    tyre_summary: list[TyreStint]


class SegmentResult(BaseModel):
    position: int
    driver: str
    team: str | None
    lap_number: int
    lap_time_seconds: float
    gap_to_segment_best: float
    compound: str | None


class QualifyingSegment(BaseModel):
    segment: str
    results: list[SegmentResult]


class QualifyingAnalysis(BaseModel):
    event: EventSummary
    session: SessionSummary
    drivers: list[Driver]
    best_laps: list[RankedLap]
    top_speeds: list[TopSpeed]
    segments: list[QualifyingSegment]
    attempts: list[QualifyingAttempt]


class PerformanceSummary(BaseModel):
    lap_count: int
    timed_lap_count: int
    fastest_lap_seconds: float | None
    average_lap_seconds: float | None
    median_lap_seconds: float | None
    best_sector_1_seconds: float | None
    best_sector_2_seconds: float | None
    best_sector_3_seconds: float | None


class DriverAnalysis(BaseModel):
    driver: Driver
    event: EventSummary
    session: SessionSummary
    summary: PerformanceSummary
    laps: list[LapSummary]
    long_runs: list[LongRun]


class TelemetrySample(BaseModel):
    distance: float
    speed: float | None
    rpm: float | None
    gear: int | None
    throttle: float | None
    brake: bool | None
    drs: int | None
    x: float | None
    y: float | None


class LapTelemetry(BaseModel):
    summary: LapSummary
    telemetry: list[TelemetrySample]


class TrackPoint(BaseModel):
    x: float
    y: float
    progress: float


class TrackLayout(BaseModel):
    year: int
    race: str
    session: str
    official_circuit_url: str | None
    points: list[TrackPoint]


class LapTimeDelta(BaseModel):
    lap_time_seconds: float | None


class LapComparison(BaseModel):
    event: EventSummary
    session: SessionSummary
    lap_a: LapTelemetry
    lap_b: LapTelemetry
    delta: LapTimeDelta


class LongRunDelta(BaseModel):
    average_pace_seconds: float | None
    median_pace_seconds: float | None
    pace_dropoff_per_lap: float | None
    tyre_degradation_per_lap: float | None


class LongRunComparison(BaseModel):
    event: EventSummary
    session: SessionSummary
    run_a: LongRun
    run_b: LongRun
    delta: LongRunDelta


class CompoundRankingEntry(BaseModel):
    run_id: str
    position: int
    driver: str
    stint: int
    average_pace_seconds: float
    gap_to_compound_best: float | None


class CompoundRanking(BaseModel):
    compound: str
    best_average_pace_seconds: float
    runs: list[CompoundRankingEntry]


class SessionTyreRanking(BaseModel):
    position: int
    compound: str
    best_average_pace_seconds: float
    gap_to_session_best: float | None
    fastest_run: CompoundRankingEntry


class LongRunEvent(BaseModel):
    year: int
    race: str


class LongRunOverview(BaseModel):
    event: LongRunEvent
    session: str
    selected_drivers: list[str]
    min_laps: int
    fuel_correction_per_lap: float
    runs: list[LongRun]
    tyre_rankings: list[CompoundRanking]
    session_tyre_ranking: list[SessionTyreRanking]
