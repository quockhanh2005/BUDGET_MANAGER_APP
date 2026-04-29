from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class WalletBase(BaseModel):
    member_id: str
    wallet_address: str
    balance: float = 0.0
    currency: str = "ETH"
    status: str = "active"

class WalletCreate(WalletBase):
    pass

class WalletResponse(WalletBase):
    id: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
