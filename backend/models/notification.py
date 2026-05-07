from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class Notification(BaseModel):
    id: Optional[str] = None
    user_address: str
    title: str
    message: str
    type: str = "info" # info, success, warning, danger
    budget_id: Optional[str] = None
    is_read: bool = False
    created_at: datetime = datetime.now()

class NotificationResponse(Notification):
    pass
