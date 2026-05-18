import logging
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.security import (
    create_verification_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.schemas.user import UserRegister
from app.services.email import send_verification_email

logger = logging.getLogger(__name__)


def register_user(db: Session, payload: UserRegister) -> User:
    normalized_email = payload.email.lower()
    existing = db.scalar(
        select(User).where(
            or_(User.email == normalized_email, User.username == payload.username)
        )
    )
    if existing is not None:
        if existing.email == normalized_email:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered",
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already taken",
        )

    user = User(
        email=normalized_email,
        username=payload.username,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    _dispatch_verification(user)
    return user


def authenticate(db: Session, *, email: str, password: str) -> User:
    user = db.scalar(select(User).where(User.email == email.lower()))
    if user is None or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled",
        )
    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified. Check your inbox for the verification link.",
        )
    return user


def verify_email(db: Session, token: str) -> User:
    email = decode_token(token, expected_type="verify")
    if email is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token",
        )
    user = db.scalar(select(User).where(User.email == email.lower()))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    if not user.is_verified:
        user.is_verified = True
        user.verified_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(user)
    return user


def resend_verification(db: Session, email: str) -> None:
    user = db.scalar(select(User).where(User.email == email.lower()))
    if user is None or user.is_verified:
        return
    _dispatch_verification(user)


def _dispatch_verification(user: User) -> None:
    token = create_verification_token(user.email)
    try:
        send_verification_email(to=user.email, username=user.username, token=token)
    except Exception:
        logger.exception("Verification email dispatch failed for %s", user.email)
