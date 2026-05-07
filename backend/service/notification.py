from backend.utils.database import db_instance
from datetime import datetime
import uuid
from typing import List, Dict

class NotificationService:
    def __init__(self):
        self.db = db_instance.get_db("notification")
        self.collection = self.db["notifications"]

    def create_notification(self, data: Dict):
        """
        Tạo thông báo mới cho người dùng.
        """
        notification_id = str(uuid.uuid4())
        data["id"] = notification_id
        data["is_read"] = False
        if "created_at" not in data:
            data["created_at"] = datetime.utcnow()
        
        # Đảm bảo địa chỉ ví là chữ thường
        if "user_address" in data:
            data["user_address"] = data["user_address"].lower()
            
        self.collection.insert_one(data)
        if "_id" in data:
            del data["_id"]
        return data

    def get_notifications(self, user_address: str, limit: int = 20):
        """
        Lấy danh sách thông báo của người dùng.
        """
        user_address = user_address.lower()
        cursor = self.collection.find({"user_address": user_address}, {"_id": 0}).sort("created_at", -1).limit(limit)
        return list(cursor)

    def mark_as_read(self, notification_id: str):
        """
        Đánh dấu thông báo là đã đọc.
        """
        self.collection.update_one(
            {"id": notification_id},
            {"$set": {"is_read": True}}
        )
        return True

    def mark_all_as_read(self, user_address: str):
        """
        Đánh dấu tất cả thông báo của người dùng là đã đọc.
        """
        user_address = user_address.lower()
        self.collection.update_many(
            {"user_address": user_address, "is_read": False},
            {"$set": {"is_read": True}}
        )
        return True

    def notify_budget_members(self, budget_id: str, budget_name: str, title: str, message: str, notification_type: str = "info", members: List = []):
        """
        Gửi thông báo cho tất cả thành viên trong quỹ.
        """
        for member in members:
            addr = member.get("address")
            if addr:
                self.create_notification({
                    "user_address": addr.lower(),
                    "title": f"[{budget_name}] {title}",
                    "message": message,
                    "type": notification_type,
                    "budget_id": budget_id
                })

notification_service = NotificationService()
