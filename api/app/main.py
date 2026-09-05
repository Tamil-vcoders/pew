from fastapi import FastAPI

app = FastAPI(title="pew-api")


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}
