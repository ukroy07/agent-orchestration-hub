import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, EmailStr, Field


class UserRegister(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8, max_length=128)
    # What the person is asking for. It is a request, not a grant - an admin
    # decides what is actually given, and may grant something narrower.
    requested_role: str = "user"


class UserLogin(BaseModel):
    email: EmailStr
    password: str
    # No role field, deliberately. The session role is derived from the
    # account (see _default_role in api/routes/auth.py), so a client cannot
    # ask to be signed in as something other than what it is. Removing the
    # field rather than validating it also closes the API-level version of
    # the hole: a hand-rolled POST carrying {"role": "user"} for an admin
    # account is ignored rather than honoured.


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    username: str
    avatar_url: Optional[str] = None
    is_active: bool
    roles: List[str]
    approval_status: str
    requested_role: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def model_validate(cls, obj, **kwargs):
        # `roles` is a comma-separated column on the model but a list on the
        # wire - clients should never have to know about the storage format.
        if hasattr(obj, "role_list"):
            data = {
                "id": obj.id,
                "email": obj.email,
                "username": obj.username,
                "avatar_url": obj.avatar_url,
                "is_active": obj.is_active,
                "roles": obj.role_list,
                "approval_status": obj.approval_status,
                "requested_role": obj.requested_role,
                "created_at": obj.created_at,
            }
            return super().model_validate(data, **kwargs)
        return super().model_validate(obj, **kwargs)


class TokenResponse(BaseModel):
    """What a successful sign-in returns.

    Note what is *absent*: the refresh token. It goes back as an HttpOnly
    cookie instead, so no script on the page can read it. Putting it in this
    body would force the client to store it somewhere JavaScript can reach.
    """
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    active_role: str
    user: UserOut


class RegistrationAccepted(BaseModel):
    email: str
    requested_role: str
    message: str


class OAuthExchangeRequest(BaseModel):
    code: str
