from fastapi import APIRouter, HTTPException
from typing import List
from backend.service.member import MemberService
from backend.models.member import MemberRequest, MemberResponse
from backend.utils.auth import verify_eth_signature

router = APIRouter(prefix="/members", tags=["members"])
member_service = MemberService()

# Base URL = "localhost:8080/members"

@router.post("/", response_model=MemberResponse)
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

@router.get("/", response_model=MemberResponse)
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

@router.get("/all", response_model=List[MemberResponse])
def get_all_members():
    """
    Lấy danh sách tất cả thành viên đã đăng ký trên hệ thống.
    """
    return member_service.get_all_members()

@router.post("/login", response_model=MemberResponse)
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