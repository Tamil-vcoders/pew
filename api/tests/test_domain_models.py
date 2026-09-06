# api/tests/test_domain_models.py
from datetime import UTC, datetime

from app.domain.models import Project, ProjectCfg, Prompt, User


def test_project_cfg_defaults_match_gemini_only_v1_scope() -> None:
    cfg = ProjectCfg()
    assert cfg.target == 8.0
    assert cfg.max_iter == 4
    assert cfg.budget == 0.6
    assert cfg.n_sug == 2
    assert cfg.auto is False
    assert cfg.weights == {"code": 1.0, "model": 1.0, "human": 1.0}
    assert cfg.models == {
        "execution": "gemini-3.1-pro-preview",
        "grading": "gemini-3.6-flash",
        "suggestions": "gemini-3.6-flash",
        "datasetGen": "gemini-3.6-flash",
    }


def test_prompt_defaults_to_no_versions_and_no_score() -> None:
    prompt = Prompt(
        id="p1", project_id="j1", name="Ticket triage", tags=["triage"],
        archived=False, best_score=None, latest_version=0,
    )
    assert prompt.best_score is None
    assert prompt.latest_version == 0


def test_user_and_project_are_plain_dataclasses() -> None:
    user = User(uid="u1", email="a@b.com", name="A", role="administrator",
                created_at=datetime.now(UTC))
    project = Project(id="j1", name="Support automation", cfg=ProjectCfg())
    assert user.role == "administrator"
    assert project.name == "Support automation"
