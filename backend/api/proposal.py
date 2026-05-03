from fastapi import APIRouter, HTTPException, Query
from typing import List
from backend.service.proposal import ProposalService
from backend.models.member import MembershipProposalRequest, MembershipProposalResponse
from backend.models.proposal import ApprovalRequest

router = APIRouter(prefix="/proposals-management", tags=["proposals-management"])
proposal_service = ProposalService()

@router.get("/{budget_id}")
async def get_all_proposals(budget_id: str):
    """Lấy danh sách đề xuất của một quỹ"""
    return proposal_service.get_proposals_by_budget(budget_id)

@router.post("/create-membership", response_model=MembershipProposalResponse)
async def create_membership_proposal(request: MembershipProposalRequest):
    """Tạo đề xuất thêm/xóa thành viên với chữ ký ban đầu"""
    try:
        return proposal_service.create_membership_proposal(
            budget_id=request.budget_id,
            p_type=request.type,
            target_address=request.target_address,
            proposer_address=request.proposer_address,
            nonce=request.nonce,
            deadline=request.deadline,
            signature=request.signature,
            new_threshold=request.new_threshold
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{proposal_id}/approve")
async def approve(proposal_id: str, request: ApprovalRequest):
    """Duyệt đề xuất với chữ ký cá nhân"""
    try:
        return proposal_service.approve_proposal(proposal_id, request.voter_address, request.signature)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{proposal_id}/execute")
async def execute(proposal_id: str, tx_hash: str = Query(None)):
    """Thực thi đề xuất khi đã đủ ngưỡng biểu quyết và đã submit lên Blockchain"""
    try:
        return proposal_service.execute_proposal(proposal_id, tx_hash)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/{proposal_id}")
async def cancel(proposal_id: str, operator_address: str = Query(...)):
    """Hủy đề xuất"""
    try:
        return proposal_service.cancel_membership_proposal(proposal_id, operator_address)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
