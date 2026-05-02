from fastapi import APIRouter, HTTPException, status, Query
from typing import List, Optional
from backend.models.budget import (
    BudgetRequest, BudgetResponse, BudgetMember, AddMemberRequest, 
    DepositRequest, WithdrawRequestCreate, WithdrawRequestResponse
)
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

@router.get("/{budget_id}/withdraw-requests", response_model=List[WithdrawRequestResponse])
async def get_withdraw_requests(budget_id: str):
    return budget_service.get_withdraw_requests(budget_id)

@router.post("/{budget_id}/withdraw-requests", response_model=WithdrawRequestResponse)
async def create_withdraw_request(budget_id: str, address: str, request: WithdrawRequestCreate):
    return budget_service.create_withdraw_request(budget_id, address, request.dict())

    return result

@router.post("/withdraw-requests/{request_id}/sign", response_model=WithdrawRequestResponse)
async def sign_withdraw_request(request_id: str, address: str = Query(...), signature: str = Query(...)):
    result, msg = budget_service.add_withdraw_signature(request_id, address, signature)
    if not result:
        raise HTTPException(status_code=400, detail=msg)
    return result

@router.delete("/withdraw-requests/{request_id}")
async def cancel_withdraw_request(request_id: str, operator_address: str = Query(...)):
    result, msg = budget_service.cancel_withdraw_request(request_id, operator_address)
    if not result:
        raise HTTPException(status_code=400, detail=msg)
    return {"message": msg}

@router.post("/{budget_id}/deposit", response_model=BudgetResponse)
async def deposit_to_budget(budget_id: str, request: DepositRequest):
    result, message = budget_service.deposit_to_budget(budget_id, request.dict())
    if not result:
        raise HTTPException(status_code=404, detail=message)
    return result
