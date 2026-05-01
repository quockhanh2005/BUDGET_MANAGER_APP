from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class TransactionLog(BaseModel):
    wallet_address: str
    title: str
    amount: float
    type: str  # 'expense', 'income', 'deployment', etc.
    hash: Optional[str] = None
    gas_fee: Optional[float] = 0.0
    date: datetime = datetime.utcnow()

class TransactionResponse(TransactionLog):
    id: str
