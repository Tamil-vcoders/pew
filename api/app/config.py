# app/config.py
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    firebase_project_id: str = "pew-ideathon"
    cors_origins: str = "http://localhost:3000"
    gemini_api_key: str = ""
    # devspec §15's own rehearsal-mode risk mitigation ("a FakeLLMProvider flag for
    # rehearsals") — lets the API run demos/local verification without spending real Gemini
    # tokens or hitting free-tier rate limits. Defaults off; never set in deploy.yml.
    use_fake_llm: bool = False

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
