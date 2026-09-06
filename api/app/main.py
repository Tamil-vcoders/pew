from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.ports.llm import LLMCallError
from app.routes import (
    admin,
    auth,
    cycles,
    datasets,
    internal,
    projects,
    prompts,
    runs,
    suggestions,
    versions,
)

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
app.include_router(admin.router)
app.include_router(internal.router)


@app.exception_handler(LLMCallError)
async def llm_call_error_handler(request: Request, exc: LLMCallError) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}
