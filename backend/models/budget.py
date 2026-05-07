from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class BudgetMember(BaseModel):
    budget_id: Optional[str] = None
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
    vault_address: Optional[str] = None
    vault_state: str = "active" # created, active, locked, closed
    tx_hash: Optional[str] = None
    gas_fee: Optional[float] = 0.0
    members: List[BudgetMember] = []
    rules: List[BudgetRule] = []
    transactions: List[BudgetTransaction] = []

class AddMemberRequest(BaseModel):
    address: str
    role: str

class DepositRequest(BaseModel):
    amount: float
    tx_hash: str
    sender_address: str
    gas_fee: Optional[float] = 0.0

class WithdrawSignature(BaseModel):
    signer_address: str
    signature: str
    created_at: datetime = datetime.now()

class WithdrawRequestCreate(BaseModel):
    title: Optional[str] = "Rút tiền"
    to: str
    amount: float
    category_id: int = 0
    nonce: int
    deadline: int
    signature: str # Chữ ký đầu tiên từ người tạo

class WithdrawRequestResponse(BaseModel):
    id: str
    budget_id: str
    title: Optional[str] = "Rút tiền"
    to: str
    amount: float
    category_id: int = 0
    nonce: int
    deadline: int
    creator_address: str
    signatures: List[WithdrawSignature] = []
    status: str = "pending" # pending, executed, cancelled
    tx_hash: Optional[str] = None
    created_at: datetime

class CategoryLimit(BaseModel):
    category_id: int
    limit_amount: float
    amount_spent: float = 0.0
    is_active: bool = True

class SetCategoryLimitRequest(BaseModel):
    category_id: int
    limit_amount: float
    nonce: int
    deadline: int
    signature: str # Initial signature

class SetCategoryLimitProposal(BaseModel):
    id: str
    budget_id: str
    category_id: int
    limit_amount: float
    nonce: int
    deadline: int
    creator_address: str
    signatures: List[WithdrawSignature] = []
    status: str = "pending" # pending, executed, rejected
    tx_hash: Optional[str] = None
    created_at: datetime

class BudgetResponse(BudgetRequest):
    id: str
    balance: float = 0.0
    created_at: datetime

    class Config:
        from_attributes = True
