# app/deps.py
from __future__ import annotations

import firebase_admin
from google.cloud import firestore

from app.config import get_settings

_firebase_app: firebase_admin.App | None = None
_firestore_client: firestore.AsyncClient | None = None


def get_firebase_app() -> firebase_admin.App:
    global _firebase_app
    if _firebase_app is None:
        _firebase_app = firebase_admin.initialize_app(
            options={"projectId": get_settings().firebase_project_id}
        )
    return _firebase_app


def get_firestore_client() -> firestore.AsyncClient:
    global _firestore_client
    if _firestore_client is None:
        get_firebase_app()  # ensure a default app exists before any auth calls happen
        _firestore_client = firestore.AsyncClient(project=get_settings().firebase_project_id)
    return _firestore_client
