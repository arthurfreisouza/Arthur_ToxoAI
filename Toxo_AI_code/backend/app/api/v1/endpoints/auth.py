from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token
from app.db.session import get_db
from app.schemas.token import Token, VerifyRequest
from app.schemas.user import (
    ResendVerificationRequest,
    UserLogin,
    UserOut,
    UserRegister,
)
from app.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegister, db: Session = Depends(get_db)) -> UserOut:
    user = auth_service.register_user(db, payload)
    return UserOut.model_validate(user)


@router.post("/login", response_model=Token)
def login(payload: UserLogin, db: Session = Depends(get_db)) -> Token:
    user = auth_service.authenticate(db, email=payload.email, password=payload.password)
    return Token(
        access_token=create_access_token(user.id),
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/verify", response_model=UserOut)
def verify(payload: VerifyRequest, db: Session = Depends(get_db)) -> UserOut:
    user = auth_service.verify_email(db, payload.token)
    return UserOut.model_validate(user)


@router.post("/resend-verification", status_code=status.HTTP_202_ACCEPTED)
def resend(payload: ResendVerificationRequest, db: Session = Depends(get_db)) -> dict:
    auth_service.resend_verification(db, payload.email)
    return {
        "message": (
            "If the email is registered and not yet verified, "
            "a new verification email has been sent."
        )
    }
