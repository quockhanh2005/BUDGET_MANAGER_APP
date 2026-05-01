from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional

# Model cho UC-MEMBER-01 (Xem danh sách quỹ) và UC-MEMBER-02 (Xem chi tiết quỹ)
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

# Model cho UC-MEMBER-06 (Thêm thành viên) và UC-MEMBER-07 (Xóa thành viên)
class MembershipProposalRequest(BaseModel):
    budget_id: str
    type: str  # "ADD_MEMBER" hoặc "REMOVE_MEMBER"
    target_address: str
    proposer_address: str
    reason: Optional[str] = ""

class MembershipProposalResponse(BaseModel):
    id: str
    budget_id: str
    type: str
    target_address: str
    proposer_address: str
    status: str  # "pending", "approved", "rejected"
    approvals: List[str]
    created_at: datetime
