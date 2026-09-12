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


def team_run_detail(db_file: str, run_id: str) -> dict[str, Any] | None:
    """Return a sanitized conversation and specialist timeline for one team run."""
    path = Path(db_file).resolve()
    if not path.exists():
        return None

    connection = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        row = connection.execute(
            """
            SELECT run_id, session_id, status, created_at, updated_at, run_data
            FROM agno_runs
            WHERE run_id = ? AND run_type = 'team'
              AND team_id = 'workspace-council' AND parent_run_id IS NULL
            """,
            (run_id,),
        ).fetchone()
        child_rows = connection.execute(
            """
            SELECT agent_id, status, created_at, updated_at, run_data
            FROM agno_runs
            WHERE parent_run_id = ? AND run_type = 'agent'
            ORDER BY created_at
            """,
            (run_id,),
        ).fetchall()
    finally:
        connection.close()

    if row is None:
        return None
    try:
        data = json.loads(row[5])
    except (TypeError, json.JSONDecodeError):
        data = {}

    conversation: list[dict[str, Any]] = []
    for message in data.get("messages", []):
        if not isinstance(message, dict) or message.get("role") not in {"user", "assistant"}:
            continue
        content = message.get("content")
        if not isinstance(content, str) or not content.strip():
            continue
        if message["role"] == "user":
            content = _mission_text({"input_content": content})
        else:
            content = " ".join(content.split())[:4000]
        if content:
            conversation.append(
                {
                    "role": message["role"],
                    "content": content,
                    "created_at": message.get("created_at"),
                }
            )

    specialists: list[dict[str, Any]] = []
    for agent_id, status, created_at, updated_at, raw_child in child_rows:
        try:
            child = json.loads(raw_child)
        except (TypeError, json.JSONDecodeError):
            child = {}
        content = child.get("content") if isinstance(child.get("content"), str) else ""
        specialists.append(
            {
                "agent_id": agent_id,
                "agent_name": child.get("agent_name") or agent_id,
                "status": status,
                "created_at": created_at,
                "updated_at": updated_at,
                "summary": " ".join(content.split())[:700],
            }
        )

    metrics = data.get("metrics") if isinstance(data.get("metrics"), dict) else {}
    return {
        "run_id": row[0],
        "session_id": row[1],
        "status": row[2],
        "created_at": row[3],
        "updated_at": row[4],
        "mission": _mission_text(data.get("input")),
        "final_summary": " ".join(str(data.get("content") or "").split())[:4000],
        "duration": metrics.get("duration"),
        "conversation": conversation,
        "specialists": specialists,
    }
