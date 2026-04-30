from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class BudgetMember(BaseModel):
    name: str
    address: Optional[str] = ""
    role: str
    avatar: str

class BudgetRule(BaseModel):
    name: str
    desc: str

class BudgetTransaction(BaseModel):
    title: str
    amount: float
    date: str
    type: str

class BudgetRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    type: str = "Khác"
    creator_address: str
    members: List[BudgetMember] = []
    rules: List[BudgetRule] = []
    transactions: List[BudgetTransaction] = []

class BudgetResponse(BudgetRequest):
    id: str
    balance: float = 0.0
    created_at: datetime

    class Config:
        from_attributes = True
