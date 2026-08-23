import redis.asyncio as redis
from app.config import settings

# "memory://" swaps in fakeredis, an in-process Redis implementation, so the
# app runs with no Redis server installed (see README "Zero-infra local
# dev"). It is a real dev convenience, not a stub: fakeredis implements
# pub/sub and list commands, which is everything the live agent stream needs
# (publish/subscribe + the rpush/lrange replay buffer).
#
# The catch, and why this is dev-only: the data lives inside *this* process,
# so a second uvicorn worker would get its own empty copy and see none of the
# first one's events. Anything beyond `--workers 1` needs real Redis.
if settings.REDIS_URL.startswith("memory://"):
    import fakeredis.aioredis

    redis_client = fakeredis.aioredis.FakeRedis(decode_responses=True)
else:
    # decode_responses=True so we work with str everywhere instead of bytes
    redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
