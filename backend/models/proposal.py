from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional
from enum import Enum

class ProposalStatus(str, Enum):
    PENDING = "pending"
    EXECUTED = "executed"
    REJECTED = "rejected"

class ProposalType(str, Enum):
    ADD_MEMBER = "ADD_MEMBER"
    REMOVE_MEMBER = "REMOVE_MEMBER"
    SPENDING = "SPENDING"

class ProposalBase(BaseModel):
    id: str
    budget_id: str
    type: ProposalType
    proposer_address: str
    status: ProposalStatus = ProposalStatus.PENDING
    approvals: List[str] = []
    created_at: datetime = datetime.utcnow()
    updated_at: Optional[datetime] = None

class MembershipProposal(ProposalBase):
    target_address: str

class TransactionProposal(ProposalBase):
    amount: float
    receiver_address: str
    reason: Optional[str] = ""

class ApprovalRequest(BaseModel):
    voter_address: str
