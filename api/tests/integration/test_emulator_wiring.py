# api/tests/integration/test_emulator_wiring.py
from app.deps import get_firebase_app, get_firestore_client


async def test_firestore_client_reaches_emulator() -> None:
    client = get_firestore_client()
    doc_ref = client.collection("wiring_check").document("ping")
    await doc_ref.set({"ok": True})
    snap = await doc_ref.get()
    assert snap.exists
    assert snap.to_dict() == {"ok": True}


def test_firebase_app_initializes_without_real_credentials() -> None:
    app = get_firebase_app()
    assert app.project_id == "demo-pew-test"
