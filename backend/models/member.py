from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from backend.models.wallet import WalletResponse

class MemberRequest(BaseModel):
    member_id: str
    name: str
    age: int
    member_address: str
    email: Optional[str] = None
    signature: str    # Chữ ký từ MetaMask
    message: str      # Nội dung đã ký

class MemberResponse(BaseModel):
    member_id: str
    name: str
    age: int
    member_address: str
    role: str = "user"
    email: Optional[str] = None
    wallet: Optional[WalletResponse] = None
    created_at: datetime

    class Config:
        from_attributes = True
