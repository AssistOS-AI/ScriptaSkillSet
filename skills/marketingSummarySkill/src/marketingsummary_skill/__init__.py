"""Deterministic workflow for spoiler-safe marketing summaries."""

from .core import MarketingSummaryError, build_job, job_status, prepare_job

__all__ = ["MarketingSummaryError", "build_job", "job_status", "prepare_job"]
