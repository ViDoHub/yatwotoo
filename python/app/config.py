from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    mongodb_url: str = 'mongodb://localhost:27017'
    mongodb_db: str = 'yad2search'
    port: int = 8000
    log_format: str = 'text'  # 'text' or 'json'

    callmebot_phone: str = ''
    callmebot_apikey: str = ''

    poll_interval_minutes: int = 15
    request_delay_min: float = 0.3
    request_delay_max: float = 0.8
    scrape_concurrency: int = 3
    backup_dir: str = 'backups'
    backup_retention_days: int = 7

    class Config:
        env_file = '.env'


settings = Settings()
