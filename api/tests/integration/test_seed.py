# api/tests/integration/test_seed.py
from app.deps import get_firestore_client
from scripts.seed import run as run_seed


async def test_seed_creates_two_projects_and_three_prompts() -> None:
    await run_seed()
    fs = await get_firestore_client()

    projects = {d.to_dict()["name"]: d.id async for d in fs.collection("projects").stream()}
    assert set(projects) == {"Support automation", "Marketing copy"}

    triage_prompts = [
        d.to_dict()
        async for d in fs.collection("projects").document(projects["Support automation"])
        .collection("prompts").stream()
    ]
    assert {p["name"] for p in triage_prompts} == {"Ticket triage", "Reply drafter"}
    triage = next(p for p in triage_prompts if p["name"] == "Ticket triage")
    assert triage["tags"] == ["triage", "prod"]
    assert triage["latestVersion"] == 1

    blurb_prompts = [
        d.to_dict()
        async for d in fs.collection("projects").document(projects["Marketing copy"])
        .collection("prompts").stream()
    ]
    assert [p["name"] for p in blurb_prompts] == ["Product blurb writer"]


async def test_seed_creates_four_demo_accounts_with_distinct_roles() -> None:
    await run_seed()
    fs = await get_firestore_client()
    users = {d.to_dict()["email"]: d.to_dict()["role"] async for d in fs.collection("users").stream()}
    assert users == {
        "asha@acme.dev": "administrator",
        "vikram@acme.dev": "maintainer",
        "meera@acme.dev": "contributor",
        "dev@acme.dev": "viewer",
    }


async def test_seed_is_idempotent() -> None:
    await run_seed()
    await run_seed()
    fs = await get_firestore_client()
    projects = [d async for d in fs.collection("projects").stream()]
    assert len(projects) == 2
