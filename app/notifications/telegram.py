import logging

import httpx

from app.models import UserSettings

logger = logging.getLogger(__name__)


async def get_telegram_config() -> dict[str, str]:
    """Get Telegram config from DB."""
    user_settings: UserSettings | None = await UserSettings.find_one()
    if user_settings and user_settings.telegram_bot_token and user_settings.telegram_chat_id:
        return {
            'token': user_settings.telegram_bot_token,
            'chat_id': user_settings.telegram_chat_id,
        }
    return {}


async def send_telegram(message: str, token: str = '', chat_id: str = '') -> bool:
    """Send a Telegram message via Bot API.

    If token/chat_id not provided, reads from UserSettings.
    Returns True on success.
    """
    if not token or not chat_id:
        config: dict[str, str] = await get_telegram_config()
        if not config:
            logger.warning('Telegram not configured (no token/chat_id)')
            return False
        token = config['token']
        chat_id = config['chat_id']

    url: str = f'https://api.telegram.org/bot{token}/sendMessage'
    payload: dict[str, str] = {
        'chat_id': chat_id,
        'text': message,
        'parse_mode': 'Markdown',
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(url, json=payload)
            if response.status_code == 200:
                logger.info('Telegram message sent')
                return True
            logger.error(f'Telegram API error {response.status_code}: {response.text}')
            return False
    except Exception as e:
        logger.error(f'Error sending Telegram message: {e}')
        return False
