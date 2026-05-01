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
async def delete_budget(budget_id: str):
    result = budget_service.delete_budget(budget_id)
    if not result:
        raise HTTPException(status_code=404, detail="Không tìm thấy quỹ để xóa")
    return {"message": "Xóa quỹ thành công"}

@router.delete("/{budget_id}/members/{address}", response_model=BudgetResponse)
async def remove_member(budget_id: str, address: str):
    result = budget_service.remove_member(budget_id, address)
    if not result:
        raise HTTPException(status_code=404, detail="Không tìm thấy thành viên hoặc lỗi khi xóa")
    return result
