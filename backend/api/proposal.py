from fastapi import APIRouter, HTTPException, Query
from typing import List
from backend.service.proposal import ProposalService
from backend.models.proposal import ApprovalRequest
from backend.models.membership import MembershipProposalRequest, MembershipProposalResponse

router = APIRouter(prefix="/proposals-management", tags=["proposals-management"])
proposal_service = ProposalService()

@router.get("/{budget_id}")
async def get_all_proposals(budget_id: str):
    """Lấy danh sách đề xuất của một quỹ"""
    return proposal_service.get_proposals_by_budget(budget_id)

@router.post("/create-membership", response_model=MembershipProposalResponse)
async def create_membership_proposal(request: MembershipProposalRequest):
    """Tạo đề xuất thêm/xóa thành viên"""
    try:
        return proposal_service.create_membership_proposal(
            budget_id=request.budget_id,
            p_type=request.type,
            target_address=request.target_address,
            proposer_address=request.proposer_address
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{proposal_id}/approve")
async def approve(proposal_id: str, request: ApprovalRequest):
    """Duyệt đề xuất"""
    try:
        return proposal_service.approve_proposal(proposal_id, request.voter_address)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{proposal_id}/execute")
async def execute(proposal_id: str):
    """Thực thi đề xuất khi đã đủ ngưỡng biểu quyết (Threshold)"""
    try:
        return proposal_service.execute_proposal(proposal_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
