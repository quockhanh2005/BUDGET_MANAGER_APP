from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional
from enum import Enum
from backend.models.wallet import WalletResponse

# --- Enums (Merged from proposal.py) ---
class ProposalStatus(str, Enum):
    PENDING = "pending"
    EXECUTED = "executed"
    REJECTED = "rejected"

class ProposalType(str, Enum):
    ADD_MEMBER = "ADD_MEMBER"
    REMOVE_MEMBER = "REMOVE_MEMBER"
    SPENDING = "SPENDING"

# --- Member Models ---
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

# --- Membership & Budget Models ---
class MemberBudgetResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = ""
    type: str
    balance: float
    members: List[dict]
    threshold: int
    creator_address: str
    created_at: datetime

class ProposalSignature(BaseModel):
    signer_address: str
    signature: str
    created_at: datetime = datetime.utcnow()

class MembershipProposalRequest(BaseModel):
    budget_id: str
    type: ProposalType
    target_address: str
    proposer_address: str
    nonce: int
    deadline: int
    signature: str
    new_threshold: Optional[int] = None
    reason: Optional[str] = ""

class MembershipProposalResponse(BaseModel):
    id: str
    budget_id: str
    type: str
    target_address: str
    proposer_address: str
    status: str
    signatures: List[ProposalSignature] = []
    nonce: Optional[int] = None
    deadline: Optional[int] = None
    new_threshold: Optional[int] = None
    created_at: datetime
