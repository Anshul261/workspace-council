"""Mission history exposes summaries without raw agent internals."""

import json
import sqlite3

from workspace_council.history import recent_team_runs, team_run_detail


def test_recent_team_runs_returns_only_sanitized_top_level_runs(tmp_path) -> None:
    db_file = tmp_path / "history.db"
    connection = sqlite3.connect(db_file)
    connection.execute(
        """
        CREATE TABLE agno_runs (
            run_id TEXT, session_id TEXT, run_type TEXT, agent_id TEXT,
            team_id TEXT, parent_run_id TEXT, status TEXT,
            run_data TEXT, created_at INTEGER, updated_at INTEGER
        )
        """
    )
    run_data = json.dumps(
        {
            "input": {"input_content": "PUBLISHING IS APPROVED.\n\nUser request:\nCreate the verification memo"},
            "content": "The memo was created and verified.",
            "messages": [
                {"role": "system", "content": "private coordinator instructions"},
                {
                    "role": "user",
                    "content": "PUBLISHING IS APPROVED.\n\nUser request:\nCreate the verification memo",
                },
                {"role": "assistant", "content": "Drafting and verifying the memo."},
                {"role": "tool", "content": "private tool output"},
            ],
            "reasoning_content": "must not be exposed",
            "tools": [{"tool_args": {"secret": "must not be exposed"}}],
            "metrics": {"duration": 12.5},
        }
    )
    connection.execute(
        "INSERT INTO agno_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ("team-1", "session-1", "team", None, "workspace-council", None, "COMPLETED", run_data, 10, 20),
    )
    child_data = json.dumps(
        {
            "agent_name": "Editorial Writer",
            "content": "Drafted the verification memo.",
            "reasoning_content": "private specialist reasoning",
        }
    )
    connection.execute(
        "INSERT INTO agno_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ("agent-1", "session-1", "agent", "editorial-writer", None, "team-1", "COMPLETED", child_data, 11, 12),
    )
    connection.commit()
    connection.close()

    runs = recent_team_runs(str(db_file))

    assert runs == [
        {
            "run_id": "team-1",
            "session_id": "session-1",
            "status": "COMPLETED",
            "created_at": 10,
            "updated_at": 20,
            "mission": "Create the verification memo",
            "summary": "The memo was created and verified.",
            "duration": 12.5,
            "specialist_runs": 1,
        }
    ]

    detail = team_run_detail(str(db_file), "team-1")

    assert detail is not None
    assert detail["mission"] == "Create the verification memo"
    assert detail["conversation"] == [
        {
            "role": "user",
            "content": "Create the verification memo",
            "created_at": None,
        },
        {
            "role": "assistant",
            "content": "Drafting and verifying the memo.",
            "created_at": None,
        },
    ]
    assert detail["specialists"] == [
        {
            "agent_id": "editorial-writer",
            "agent_name": "Editorial Writer",
            "status": "COMPLETED",
            "created_at": 11,
            "updated_at": 12,
            "summary": "Drafted the verification memo.",
        }
    ]
    assert "reasoning_content" not in detail
    assert "tools" not in detail
    assert team_run_detail(str(db_file), "missing") is None
