from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routes import auth, cycles, datasets, projects, prompts, runs, suggestions, versions

app = FastAPI(title="pew-api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(prompts.router)
app.include_router(versions.router)
app.include_router(suggestions.router)
app.include_router(datasets.router)
app.include_router(runs.router)
app.include_router(cycles.router)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}
