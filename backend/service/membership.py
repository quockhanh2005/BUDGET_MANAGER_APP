from backend.utils.database import db_instance
from datetime import datetime
import uuid
from typing import List, Optional

class MembershipService:
    def __init__(self):
        # Database cho Quỹ và Proposal
        self.db_budget = db_instance.get_db("budget")
        self.budget_collection = self.db_budget["budget"]
        self.db_proposal = db_instance.get_db("proposal")
        self.proposal_collection = self.db_proposal["membership_proposals"]
        
        self.db_member = db_instance.get_db("member")
        self.user_collection = self.db_member["user"]

    def get_my_budgets(self, wallet_address: str):
        """
        UC-MEMBER-01: Lấy danh sách quỹ mà member đang tham gia
        """
        wallet_address = wallet_address.lower()
        query = {"members.address": wallet_address}
        cursor = self.budget_collection.find(query, {"_id": 0}).sort("created_at", -1)
        return list(cursor)

    def get_budget_details(self, budget_id: str):
        """
        UC-MEMBER-02: Xem chi tiết quỹ (Đã đồng bộ thông tin Tên thật từ bảng Member)
        """
        budget = self.budget_collection.find_one({"id": budget_id}, {"_id": 0})
        if budget and "members" in budget:
            # Duyệt qua từng thành viên để lấy Tên thật từ database của Member
            for member in budget["members"]:
                # Tìm profile dựa trên địa chỉ ví
                user_profile = self.user_collection.find_one(
                    {"member_address": {"$regex": f"^{member['address']}$", "$options": "i"}}
                )
                if user_profile:
                    member["full_name"] = user_profile.get("name", "N/A")
                else:
                    member["full_name"] = "Chưa đăng ký"
        return budget

    def create_membership_proposal(self, budget_id: str, p_type: str, target_address: str, proposer_address: str):
        """
        UC-MEMBER-06 & 07: Tạo proposal (Có kiểm tra xem người được thêm đã tồn tại chưa)
        """
        target_address = target_address.lower()
        
        # ĐỒNG BỘ: Nếu là thêm thành viên, phải kiểm tra xem địa chỉ ví này đã đăng ký Member chưa
        if p_type == "ADD_MEMBER":
            user_exists = self.user_collection.find_one(
                {"member_address": {"$regex": f"^{target_address}$", "$options": "i"}}
            )
            if not user_exists:
                raise ValueError(f"Ví {target_address} chưa đăng ký tài khoản Member. Không thể thêm vào quỹ.")

        proposal_id = str(uuid.uuid4())
        proposal_data = {
            "id": proposal_id,
            "budget_id": budget_id,
            "type": p_type,
            "target_address": target_address,
            "proposer_address": proposer_address.lower(),
            "status": "pending",
            "approvals": [proposer_address.lower()],
            "created_at": datetime.utcnow()
        }
        
        self.proposal_collection.insert_one(proposal_data)
        if "_id" in proposal_data:
            del proposal_data["_id"]
        return proposal_data
