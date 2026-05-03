from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional
from backend.models.member import ProposalStatus, ProposalType, ProposalSignature

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
