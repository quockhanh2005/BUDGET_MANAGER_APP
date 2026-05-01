from fastapi import APIRouter, HTTPException, status
from typing import List, Optional
from backend.models.budget import BudgetRequest, BudgetResponse, BudgetMember, AddMemberRequest
from backend.service.budget import BudgetService

router = APIRouter(prefix="/budgets", tags=["budgets"])
budget_service = BudgetService()

@router.post("/", response_model=BudgetResponse)
async def create_budget(budget: BudgetRequest):
    result = budget_service.create_budget(budget.dict())
    if not result:
        raise HTTPException(status_code=500, detail="Lỗi khi tạo budget")
    return result

@router.get("/", response_model=List[BudgetResponse])
async def get_budgets(address: Optional[str] = None):
    return budget_service.get_budgets(address)

@router.post("/{budget_id}/members", response_model=BudgetResponse)
async def join_budget_by_address(budget_id: str, member: BudgetMember):
    result = budget_service.join_budget_by_address(budget_id, member.dict())
    if not result:
        raise HTTPException(status_code=404, detail="Không tìm thấy quỹ hoặc lỗi khi thêm thành viên")
    return result

@router.post("/{budget_id}/add-member-by-address", response_model=BudgetResponse)
async def add_member_by_address(budget_id: str, request: AddMemberRequest):
    result, message = budget_service.add_member_by_address(budget_id, request.address, request.role)
    if not result:
        raise HTTPException(status_code=404, detail=message)
    return result
@router.delete("/{budget_id}")
async def delete_budget(budget_id: str, address: str, role: Optional[str] = None):
    success, message = budget_service.delete_budget(budget_id, address, role)
    if not success:
        if message == "Bạn không có quyền xóa quỹ này":
            raise HTTPException(status_code=403, detail=message)
        raise HTTPException(status_code=404, detail=message)
    return {"message": message}

@router.delete("/{budget_id}/members/{address}", response_model=BudgetResponse)
async def remove_member(budget_id: str, address: str, operator_address: Optional[str] = None, role: Optional[str] = None):
    result, message = budget_service.remove_member(budget_id, address, operator_address, role)
    if not result:
        if message == "Bạn không có quyền xóa thành viên khỏi quỹ này":
            raise HTTPException(status_code=403, detail=message)
        raise HTTPException(status_code=404, detail=message)
    return result
