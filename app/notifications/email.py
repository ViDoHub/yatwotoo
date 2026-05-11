import logging
import smtplib
from email.message import EmailMessage

from app.models import UserSettings

logger = logging.getLogger(__name__)


async def send_email(subject: str, body: str) -> bool:
    """Send an email notification using SMTP settings from UserSettings.

    Returns True on success.
    """
    user_settings: UserSettings | None = await UserSettings.find_one()
    if not user_settings:
        logger.warning('No user settings found')
        return False

    host: str = user_settings.email_smtp_host
    port: int = user_settings.email_smtp_port
    user: str = user_settings.email_smtp_user
    password: str = user_settings.email_smtp_password
    to_addr: str = user_settings.email_to

    if not host or not to_addr:
        logger.warning('Email not configured (missing host or recipient)')
        return False

    msg: EmailMessage = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = user or f'yad2-alerts@{host}'
    msg['To'] = to_addr
    msg.set_content(body)

    try:
        if port == 465:
            # SSL
            with smtplib.SMTP_SSL(host, port, timeout=15) as smtp:
                if user and password:
                    smtp.login(user, password)
                smtp.send_message(msg)
        else:
            # STARTTLS (port 587 or others)
            with smtplib.SMTP(host, port, timeout=15) as smtp:
                smtp.ehlo()
                if port != 25:
                    smtp.starttls()
                    smtp.ehlo()
                if user and password:
                    smtp.login(user, password)
                smtp.send_message(msg)

        logger.info(f'Email sent to {to_addr}')
        return True
    except Exception as e:
        logger.error(f'Error sending email: {e}')
        return False
