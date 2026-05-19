# Database

## Engine

**PostgreSQL 16** in production (local on the VPS at `localhost:5432`).  
**SQLite** is used for local development (no setup needed).

The connection is managed by **SQLAlchemy 2.0** (`database.py`). The database URL is read from the `DATABASE_URL` environment variable:

```dotenv
# Development (SQLite — default)
DATABASE_URL=sqlite:///./users.db

# Production (PostgreSQL)
DATABASE_URL=postgresql+psycopg://iatoxo:PASSWORD@localhost:5432/iatoxo
```

## Schema

### `users` table

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `INTEGER` | PK, auto-increment | Internal user ID |
| `username` | `VARCHAR` | NOT NULL, UNIQUE, indexed | Login name |
| `email` | `VARCHAR` | NOT NULL, UNIQUE, indexed | Normalized to lowercase |
| `hashed_password` | `VARCHAR` | NOT NULL | bcrypt hash |
| `is_active` | `BOOLEAN` | NOT NULL, default `TRUE` | Soft-disable without deleting |
| `is_verified` | `BOOLEAN` | NOT NULL, default `FALSE` | Set to `TRUE` after email verification |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, server default `now()` | Account creation timestamp |
| `verified_at` | `TIMESTAMPTZ` | NULL | Set when `is_verified` becomes `TRUE` |

## Migrations / table creation

There is no migration tool (no Alembic). SQLAlchemy creates all tables automatically on startup via `init_db()` in `database.py`:

```python
Base.metadata.create_all(bind=engine)
```

This is called once from the `startup` event in `main.py`. If you add a new column to `models.py`, drop the table or the database and let it be recreated (or write a manual `ALTER TABLE` for production).

## Adding a column in production

```sql
-- Example: adding a hypothetical new column
ALTER TABLE users ADD COLUMN display_name VARCHAR(128);
```

## Connecting manually

```bash
# PostgreSQL
sudo -u postgres psql -d iatoxo

# List users
SELECT id, email, username, is_verified, created_at FROM users;

# Reset all users (wipes data!)
TRUNCATE TABLE users RESTART IDENTITY CASCADE;
```

```bash
# SQLite (development)
sqlite3 users.db "SELECT id, email, username, is_verified FROM users;"
```

## Resetting for development

```bash
# PostgreSQL
sudo -u postgres psql -d iatoxo -c "TRUNCATE TABLE users RESTART IDENTITY CASCADE;"

# SQLite — just delete the file
rm users.db
```
