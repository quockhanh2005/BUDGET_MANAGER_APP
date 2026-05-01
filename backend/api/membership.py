from fastapi import APIRouter, HTTPException, Query
from typing import List
from backend.models.membership import MemberBudgetResponse, MembershipProposalRequest, MembershipProposalResponse
from backend.service.membership import MembershipService
from backend.service.proposal import ProposalService

router = APIRouter(prefix="/membership", tags=["membership"])
membership_service = MembershipService()
proposal_service = ProposalService()

@router.get("/budgets", response_model=List[MemberBudgetResponse])
async def get_my_budgets(address: str = Query(..., description="Địa chỉ ví của member")):
    """ Xem danh sách quỹ đang tham gia"""
    return membership_service.get_my_budgets(address)

@router.get("/budgets/{budget_id}", response_model=MemberBudgetResponse)
async def get_budget_details(budget_id: str):
    """ Xem chi tiết quỹ"""
    budget = membership_service.get_budget_details(budget_id)
    if not budget:
        raise HTTPException(status_code=404, detail="Không tìm thấy quỹ")
    return budget

@router.post("/proposals", response_model=MembershipProposalResponse)
async def create_membership_proposal(proposal: MembershipProposalRequest):
    """Tạo proposal thêm/xóa thành viên"""
    if proposal.type not in ["ADD_MEMBER", "REMOVE_MEMBER"]:
        raise HTTPException(status_code=400, detail="Loại đề xuất không hợp lệ")
    
    try:
        result = proposal_service.create_membership_proposal(
            budget_id=proposal.budget_id,
            p_type=proposal.type,
            target_address=proposal.target_address,
            proposer_address=proposal.proposer_address
        )
        return result
    except ValueError as e:
        # Bắt lỗi từ service (ví dụ: ví chưa đăng ký member) và trả về lỗi 400
        raise HTTPException(status_code=400, detail=str(e))
