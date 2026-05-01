from backend.utils.database import db_instance
from datetime import datetime
import uuid
from backend.service.wallet import WalletService

class BudgetService:
    def __init__(self):
        # Quay lại dùng DB tên "budget" để hiện dữ liệu cũ
        self.db = db_instance.get_db("budget")
        self.collection = self.db["budget"]
        self.trash_collection = self.db["budget_delete"]
        self.wallet_service = WalletService() # Khởi tạo wallet service để ghi log
    
    def create_budget(self, budget_data: dict):
        budget_id = str(uuid.uuid4())
        budget_data["id"] = budget_id
        budget_data["balance"] = 0.0
        budget_data["created_at"] = datetime.utcnow()
        
        # Chuẩn hóa địa chỉ ví về chữ thường
        creator_addr = ""
        if "creator_address" in budget_data:
            creator_addr = budget_data["creator_address"].lower()
            budget_data["creator_address"] = creator_addr
        
        if "vault_address" in budget_data and budget_data["vault_address"]:
            budget_data["vault_address"] = budget_data["vault_address"].lower()
        
        # Đảm bảo người tạo quỹ có role là "Owner" trong danh sách thành viên
        if "members" in budget_data:
            for member in budget_data["members"]:
                if member.get("address", "").lower() == creator_addr:
                    member["role"] = "owner"
        
        result = self.collection.insert_one(budget_data)
        if result.inserted_id:
            # --- Tự động ghi log vào transaction_history ---
            if budget_data.get("tx_hash"):
                self.wallet_service.save_transaction({
                    "wallet_address": creator_addr,
                    "title": f"Tạo quỹ mới: {budget_data['name']}",
                    "amount": 0,
                    "type": "deployment",
                    "hash": budget_data["tx_hash"],
                    "gas_fee": budget_data.get("gas_fee", 0.0)
                })

            # Loại bỏ _id để tránh lỗi validation ở response model
            if "_id" in budget_data:
                del budget_data["_id"]
            return budget_data
        return None

    def add_member_by_address(self, budget_id: str, address: str, role: str):
        """
        Tìm thông tin người dùng từ collection 'member' và thêm vào budget.
        """
        address = address.lower()
        
        # 1. Tìm thông tin người dùng từ DB "member"
        member_db = db_instance.get_db("member")
        member_collection = member_db["user"]
        user = member_collection.find_one({"member_address": address})
        
        if not user:
            return None, "Người dùng chưa đăng ký hệ thống"

        name = user.get("name", "Người dùng")
        avatar = name[0].upper() if name else "U"

        member_data = {
            "name": name,
            "address": address,
            "role": role,
            "avatar": avatar
        }
        
        # 2. Kiểm tra nếu thành viên đã có trong quỹ rồi
        existing = self.collection.find_one({
            "id": budget_id,
            "members.address": address
        })
        if existing:
            if "_id" in existing: del existing["_id"]
            return existing, "Thành viên đã có trong quỹ"
            
        result = self.collection.update_one(
            {"id": budget_id},
            {"$push": {"members": member_data}}
        )
        
        if result.modified_count > 0:
            budget = self.collection.find_one({"id": budget_id}, {"_id": 0})
            return budget, "Thành công"
            
        return None, "Không thể cập nhật quỹ"

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

    def join_budget_by_address(self, budget_id: str, member_data: dict):
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

    def delete_budget(self, budget_id: str, operator_address: str, role: str = None):
        """
        Xử lý xóa quỹ dựa trên quyền:
        - Admin: Xóa cứng (vĩnh viễn)
        - Owner: Xóa mềm (chuyển vào budget_trash)
        - Client: Không có quyền
        """
        operator_address = operator_address.lower()
        budget = self.collection.find_one({"id": budget_id})
        
        if not budget:
            return False, "Không tìm thấy quỹ"

        # 1. Kiểm tra quyền Admin (Global)
        # Nếu role được truyền trực tiếp là 'admin', ưu tiên dùng nó
        if role == "admin":
            is_admin = True
        else:
            member_db = db_instance.get_db("member")
            user = member_db["user"].find_one({"member_address": operator_address})
            is_admin = user and user.get("role") == "admin"

        # 2. Kiểm tra quyền Owner (Budget Creator)
        is_owner = budget.get("creator_address", "").lower() == operator_address

        if is_admin:
            # Xóa cứng
            result = self.collection.delete_one({"id": budget_id})
            return result.deleted_count > 0, "Xóa cứng thành công (Admin)"
        
        elif is_owner:
            # Xóa mềm: Lưu vào trash trước khi xóa ở collection chính
            budget["deleted_at"] = datetime.utcnow()
            budget["deleted_by"] = operator_address
            # MongoDB không cho phép chèn document có _id đã tồn tại vào collection khác nếu nó bị trùng,
            # nhưng ở đây ta copy từ collection này sang collection kia và xóa ở cái cũ nên OK.
            self.trash_collection.insert_one(budget)
            result = self.collection.delete_one({"id": budget_id})
            return result.deleted_count > 0, "Xóa mềm thành công (Owner)"
        
        else:
            return False, "Bạn không có quyền xóa quỹ này"

    def remove_member(self, budget_id: str, address: str, operator_address: str, role: str = None):
        """
        Xóa một thành viên khỏi quỹ dựa trên địa chỉ ví.
        Chỉ Admin hoặc Owner mới có quyền thực hiện.
        """
        address = address.lower()
        operator_address = (operator_address or "").lower()
        
        # 1. Kiểm tra quỹ tồn tại
        budget = self.collection.find_one({"id": budget_id})
        if not budget:
            return None, "Không tìm thấy quỹ"

        # 2. Kiểm tra quyền Admin (Global)
        if role == "admin":
            is_admin = True
        else:
            member_db = db_instance.get_db("member")
            user = member_db["user"].find_one({"member_address": operator_address})
            is_admin = user and user.get("role") == "admin"

        # 3. Kiểm tra quyền Owner (Budget Creator)
        is_owner = budget.get("creator_address", "").lower() == operator_address

        if not (is_admin or is_owner):
            return None, "Bạn không có quyền xóa thành viên khỏi quỹ này"

        # 4. Thực hiện xóa thành viên
        result = self.collection.update_one(
            {"id": budget_id},
            {"$pull": {"members": {"address": address}}}
        )
        
        if result.modified_count > 0:
            updated_budget = self.collection.find_one({"id": budget_id}, {"_id": 0})
            return updated_budget, "Xóa thành viên thành công"
            
        return None, "Không tìm thấy thành viên hoặc lỗi khi xóa"