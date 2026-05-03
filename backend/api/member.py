from fastapi import APIRouter, HTTPException, Query
from typing import List
from backend.service.member import MemberService
from backend.service.proposal import ProposalService
from backend.models.member import (
    MemberRequest, 
    MemberResponse, 
    MemberBudgetResponse, 
    MembershipProposalRequest, 
    MembershipProposalResponse
)
from backend.utils.auth import verify_eth_signature

# Router cho quản lý thành viên (Prefix: /members)
member_router = APIRouter(prefix="/members", tags=["members"])
# Router cho quản lý membership trong quỹ (Prefix: /membership)
membership_router = APIRouter(prefix="/membership", tags=["membership"])

member_service = MemberService()
proposal_service = ProposalService()

# --- Member Router Routes ---

@member_router.post("/", response_model=MemberResponse)
def create_member(member: MemberRequest):
    # Xác thực chữ ký MetaMask từ Backend
    is_valid = verify_eth_signature(
        address=member.member_address,
        signature=member.signature,
        message=member.message
    )
    
    if not is_valid:
        raise HTTPException(
            status_code=401, 
            detail="Chữ ký không hợp lệ! Bạn không phải chủ sở hữu của ví này."
        )

    try:
        member_data = member_service.create_member(
            member_id=member.member_id,
            name=member.name,
            age=member.age,
            member_address=member.member_address,
            email=member.email
        )
        return member_data
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi hệ thống: {str(e)}")

@member_router.get("/", response_model=MemberResponse)
def get_member_by_address(address: str):
    """
    Kiểm tra xem ví đã được tạo tài khoản chưa.
    Nếu có, trả về thông tin member để tiến vào dashboard.
    """
    member = member_service.get_member_by_address(address)
    if not member:
        raise HTTPException(
            status_code=404, 
            detail="Ví này chưa được liên kết với tài khoản nào."
        )
    return member

@member_router.get("/all", response_model=List[MemberResponse])
def get_all_members():
    """
    Lấy danh sách tất cả thành viên đã đăng ký trên hệ thống.
    """
    return member_service.get_all_members()

@member_router.post("/login", response_model=MemberResponse)
def login_member(address: str, signature: str, message: str):
    """
    Xác thực chữ ký MetaMask và kiểm tra tài khoản.
    Nếu hợp lệ và đã có tài khoản, cho phép vào dashboard.
    """
    is_valid = verify_eth_signature(
        address=address,
        signature=signature,
        message=message
    )
    
    if not is_valid:
        raise HTTPException(
            status_code=401, 
            detail="Chữ ký không hợp lệ!"
        )

    member = member_service.get_member_by_address(address)
    if not member:
        raise HTTPException(
            status_code=404, 
            detail="Tài khoản không tồn tại. Vui lòng đăng ký."
        )

    return member

# --- Membership Router Routes ---

@membership_router.get("/budgets", response_model=List[MemberBudgetResponse])
async def get_my_budgets(address: str = Query(..., description="Địa chỉ ví của member")):
    """ Xem danh sách quỹ đang tham gia"""
    return member_service.get_my_budgets(address)

@membership_router.get("/budgets/{budget_id}", response_model=MemberBudgetResponse)
async def get_budget_details(budget_id: str):
    """ Xem chi tiết quỹ"""
    budget = member_service.get_budget_details(budget_id)
    if not budget:
        raise HTTPException(status_code=404, detail="Không tìm thấy quỹ")
    return budget

@membership_router.post("/proposals", response_model=MembershipProposalResponse)
async def create_membership_proposal(proposal: MembershipProposalRequest):
    """Tạo proposal thêm/xóa thành viên"""
    try:
        result = proposal_service.create_membership_proposal(
            budget_id=proposal.budget_id,
            p_type=proposal.type,
            target_address=proposal.target_address,
            proposer_address=proposal.proposer_address,
            nonce=proposal.nonce,
            deadline=proposal.deadline,
            signature=proposal.signature,
            new_threshold=proposal.new_threshold
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))