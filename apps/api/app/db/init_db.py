from app.db.base import Base
from app.db.session import engine

# import all models so SQLAlchemy registers them
from app.models.order import Order
from app.models.user import User
from app.models.user import UserRole


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)