
from backend.utils.database import db_instance
from datetime import datetime
import uuid

class ProposalService:
    def __init__(self):
        # Database Collections
        self.proposal_collection = db_instance.get_db("proposal")["membership_proposals"]
        self.budget_collection = db_instance.get_db("budget")["budget"]
        self.user_collection = db_instance.get_db("member")["user"]

    def get_proposals_by_budget(self, budget_id: str):
        """Lấy tất cả đề xuất của một quỹ"""
        cursor = self.proposal_collection.find({"budget_id": budget_id}, {"_id": 0}).sort("created_at", -1)
        return list(cursor)

    def create_membership_proposal(self, budget_id: str, p_type: str, target_address: str, proposer_address: str):
        """tạo đề xuất thành viên"""
        proposer_address = proposer_address.lower()
        target_address = target_address.lower()

        # Chỉ thành viên quỹ mới được tạo đề xuất
        is_member = self.budget_collection.find_one({"id": budget_id, "members.address": proposer_address})
        if not is_member:
            raise ValueError("Chỉ thành viên của quỹ mới có quyền tạo đề xuất.")

        #Nếu thêm người, người đó phải đã đăng ký tài khoản
        if p_type == "ADD_MEMBER":
            user_exists = self.user_collection.find_one({"member_address": {"$regex": f"^{target_address}$", "$options": "i"}})
            if not user_exists:
                raise ValueError(f"Địa chỉ {target_address} chưa đăng ký tài khoản Member.")

        proposal_id = str(uuid.uuid4())
        data = {
            "id": proposal_id,
            "budget_id": budget_id,
            "type": p_type,
            "target_address": target_address,
            "proposer_address": proposer_address,
            "status": "pending",
            "approvals": [proposer_address], # Người tạo tự động duyệt
            "created_at": datetime.utcnow()
        }
        self.proposal_collection.insert_one(data)
        if "_id" in data: del data["_id"]
        return data

    def approve_proposal(self, proposal_id: str, voter_address: str):
        """hêm chốt chặn bảo mật khi Duyệt"""
        voter_address = voter_address.lower()
        proposal = self.proposal_collection.find_one({"id": proposal_id})
        if not proposal: raise ValueError("Không tìm thấy đề xuất")
        
        # Kiểm tra Voter có thuộc Quỹ này không?
        budget = self.budget_collection.find_one({"id": proposal["budget_id"], "members.address": voter_address})
        if not budget:
            raise ValueError("Bạn không có quyền duyệt vì không phải thành viên của quỹ này.")

        if proposal["status"] != "pending": raise ValueError("Đề xuất đã kết thúc")
        if voter_address in proposal.get("approvals", []): return proposal

        self.proposal_collection.update_one({"id": proposal_id}, {"$push": {"approvals": voter_address}})
        return self.proposal_collection.find_one({"id": proposal_id}, {"_id": 0})

    def execute_proposal(self, proposal_id: str):
        """[TỐI ƯU] Thực thi an toàn và đồng bộ dữ liệu"""
        proposal = self.proposal_collection.find_one({"id": proposal_id})
        if not proposal or proposal["status"] != "pending": raise ValueError("Đề xuất không hợp lệ")

        budget = self.budget_collection.find_one({"id": proposal["budget_id"]})
        if len(proposal.get("approvals", [])) < budget.get("threshold", 1):
            raise ValueError("Chưa đủ chữ ký phê duyệt theo quy định của quỹ")

        # THỰC THI & ĐỒNG BỘ TÊN USER
        if proposal["type"] == "ADD_MEMBER":
            target = proposal["target_address"]
            user = self.user_collection.find_one({"member_address": {"$regex": f"^{target}$", "$options": "i"}})
            name = user.get("name", "Thành viên") if user else "Thành viên"
            
            self.budget_collection.update_one(
                {"id": proposal["budget_id"], "members.address": {"$ne": target}},
                {"$push": {"members": {"address": target, "name": name, "role": "member", "avatar": name[0].upper()}}}
            )
        elif proposal["type"] == "REMOVE_MEMBER":
            self.budget_collection.update_one({"id": proposal["budget_id"]}, {"$pull": {"members": {"address": proposal["target_address"]}}})

        self.proposal_collection.update_one({"id": proposal_id}, {"$set": {"status": "executed", "updated_at": datetime.utcnow()}})
        return {"status": "executed", "message": "Thực thi thành công"}
