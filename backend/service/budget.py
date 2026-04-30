from backend.utils.database import db_instance
from datetime import datetime
import uuid

class BudgetService:
    def __init__(self):
        # Quay lại dùng DB tên "budget" để hiện dữ liệu cũ
        self.db = db_instance.get_db("budget")
        self.collection = self.db["budget"]
    
    def create_budget(self, budget_data: dict):
        budget_id = str(uuid.uuid4())
        budget_data["id"] = budget_id
        budget_data["balance"] = 0.0
        budget_data["created_at"] = datetime.utcnow()
        
        # Chuẩn hóa địa chỉ ví về chữ thường
        if "creator_address" in budget_data:
            budget_data["creator_address"] = budget_data["creator_address"].lower()
        
        result = self.collection.insert_one(budget_data)
        if result.inserted_id:
            # Loại bỏ _id để tránh lỗi validation ở response model
            if "_id" in budget_data:
                del budget_data["_id"]
            return budget_data
        return None

    def get_budgets(self, creator_address: str = None):
        query = {}
        if creator_address:
            # Tìm các quỹ mà người dùng là người tạo HOẶC là thành viên
            query["$or"] = [
                {"creator_address": {"$regex": f"^{creator_address}$", "$options": "i"}},
                {"members.address": {"$regex": f"^{creator_address}$", "$options": "i"}}
            ]
        
        # Loại bỏ _id khỏi tất cả kết quả để tránh lỗi validation ở response model
        cursor = self.collection.find(query, {"_id": 0}).sort("created_at", -1)
        return list(cursor)

    def add_member(self, budget_id: str, member_data: dict):
        if "address" in member_data:
            member_data["address"] = member_data["address"].lower()
        
        # Kiểm tra nếu thành viên đã có trong quỹ rồi
        existing = self.collection.find_one({
            "id": budget_id,
            "members.address": member_data["address"]
        })
        if existing:
            # Nếu đã tồn tại, trả về dữ liệu hiện tại luôn, không thêm nữa
            if "_id" in existing: del existing["_id"]
            return existing
            
        result = self.collection.update_one(
            {"id": budget_id},
            {"$push": {"members": member_data}}
        )
        if result.modified_count > 0:
            budget = self.collection.find_one({"id": budget_id}, {"_id": 0})
            return budget
        return None