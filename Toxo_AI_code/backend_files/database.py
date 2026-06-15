from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker
from models import Base

# SQLite database
SQLALCHEMY_DATABASE_URL = "sqlite:///./users.db"

# Create engine
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False}
)

# Create session
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    """Initialize the database"""
    Base.metadata.create_all(bind=engine)
    _add_missing_user_columns()


def _add_missing_user_columns():
    """Add columns introduced after the initial release to existing SQLite DBs."""
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return
    existing = {col["name"] for col in inspector.get_columns("users")}
    statements = {
        "is_verified": "ALTER TABLE users ADD COLUMN is_verified BOOLEAN NOT NULL DEFAULT 0",
        "verification_token": "ALTER TABLE users ADD COLUMN verification_token VARCHAR",
        "verification_token_expires": "ALTER TABLE users ADD COLUMN verification_token_expires DATETIME",
    }
    with engine.begin() as conn:
        for column, statement in statements.items():
            if column not in existing:
                conn.execute(text(statement))


def get_db():
    """Get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
