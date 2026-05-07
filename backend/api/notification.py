from fastapi import APIRouter, HTTPException, Query
from typing import List
from backend.models.notification import NotificationResponse
from backend.service.notification import notification_service

router = APIRouter(prefix="/notifications", tags=["notifications"])

@router.get("/", response_model=List[NotificationResponse])
async def get_notifications(address: str = Query(...), limit: int = 20):
    return notification_service.get_notifications(address, limit)

@router.post("/{notification_id}/read")
async def mark_as_read(notification_id: str):
    notification_service.mark_as_read(notification_id)
    return {"status": "success"}

@router.post("/read-all")
async def mark_all_as_read(address: str = Query(...)):
    notification_service.mark_all_as_read(address)
    return {"status": "success"}
