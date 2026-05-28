from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    APP_NAME: str = "ZOMULL"
    SECRET_KEY: str = "ZMENTE-TOTO-NA-BEZPECNY-KLUC-V-PRODUKCII"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    DATABASE_URL: str = ""
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:5173"]

    APP_URL: str = "https://zomull.up.railway.app"

    DEFAULT_FOREMAN_LIMIT: float = 500.0
    UPLOAD_DIR: str = "uploads"
    MAX_FILE_SIZE_MB: int = 20

    @property
    def database_url_sync(self) -> str:
        url = self.DATABASE_URL
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        return url

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
