from fastapi import APIRouter, HTTPException, status
from typing import List, Optional
from backend.models.budget import BudgetRequest, BudgetResponse, BudgetMember
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
async def add_member(budget_id: str, member: BudgetMember):
    result = budget_service.add_member(budget_id, member.dict())
    if not result:
        raise HTTPException(status_code=404, detail="Không tìm thấy quỹ hoặc lỗi khi thêm thành viên")
    return result
