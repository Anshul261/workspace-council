"""Sanitized mission history for the operations UI."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any


def _mission_text(run_input: object) -> str:
    if not isinstance(run_input, dict):
        return ""
    value = run_input.get("input_content")
    if not isinstance(value, str):
        return ""
    for marker in ("\n\nUser request:\n", "\n\nTask:\n"):
        if marker in value:
            value = value.split(marker, 1)[1]
    return " ".join(value.split())[:320]


def recent_team_runs(db_file: str, limit: int = 8) -> list[dict[str, Any]]:
    """Return an allow-listed summary of recent top-level council runs."""
    path = Path(db_file).resolve()
    if not path.exists():
        return []

    safe_limit = max(1, min(limit, 20))
    connection = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        rows = connection.execute(
            """
            SELECT r.run_id, r.session_id, r.status, r.created_at, r.updated_at,
                   r.run_data,
                   (SELECT COUNT(*) FROM agno_runs child
                    WHERE child.parent_run_id = r.run_id) AS specialist_runs
            FROM agno_runs r
            WHERE r.run_type = 'team'
              AND r.team_id = 'workspace-council'
              AND r.parent_run_id IS NULL
            ORDER BY r.created_at DESC
            LIMIT ?
            """,
            (safe_limit,),
        ).fetchall()
    finally:
        connection.close()

    history: list[dict[str, Any]] = []
    for run_id, session_id, status, created_at, updated_at, raw_data, specialists in rows:
        try:
            data = json.loads(raw_data)
        except (TypeError, json.JSONDecodeError):
            data = {}
        metrics = data.get("metrics") if isinstance(data.get("metrics"), dict) else {}
        content = data.get("content") if isinstance(data.get("content"), str) else ""
        history.append(
            {
                "run_id": run_id,
                "session_id": session_id,
                "status": status,
                "created_at": created_at,
                "updated_at": updated_at,
                "mission": _mission_text(data.get("input")),
                "summary": " ".join(content.split())[:420],
                "duration": metrics.get("duration"),
                "specialist_runs": specialists,
            }
        )
    return history
