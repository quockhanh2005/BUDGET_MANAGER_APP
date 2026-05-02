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

class ProposalSignature(BaseModel):
    signer_address: str
    signature: str
    created_at: datetime = datetime.utcnow()

class ProposalBase(BaseModel):
    id: str
    budget_id: str
    type: ProposalType
    proposer_address: str
    status: ProposalStatus = ProposalStatus.PENDING
    signatures: List[ProposalSignature] = []
    nonce: Optional[int] = None
    deadline: Optional[int] = None
    created_at: datetime = datetime.utcnow()
    updated_at: Optional[datetime] = None

class MembershipProposal(ProposalBase):
    target_address: str
    new_threshold: Optional[int] = None

class TransactionProposal(ProposalBase):
    amount: float
    receiver_address: str
    reason: Optional[str] = ""

class ApprovalRequest(BaseModel):
    voter_address: str
    signature: str

class MembershipProposalRequest(BaseModel):
    budget_id: str
    type: ProposalType
    target_address: str
    proposer_address: str
    nonce: int
    deadline: int
    signature: str
    new_threshold: Optional[int] = None

class MembershipProposalResponse(BaseModel):
    id: str
    budget_id: str
    type: str
    target_address: str
    proposer_address: str
    status: str
    signatures: List[ProposalSignature]
    created_at: datetime
