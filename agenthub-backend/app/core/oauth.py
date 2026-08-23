from authlib.integrations.starlette_client import OAuth
from app.config import settings

oauth = OAuth()

oauth.register(
    name="google",
    client_id=settings.GOOGLE_CLIENT_ID,
    client_secret=settings.GOOGLE_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)

# To add another provider (e.g. GitHub), register it here the same way and
# add a matching branch in api/routes/oauth.py - the flow (login -> callback
# -> upsert user -> issue JWT -> exchange code) is provider-agnostic.
