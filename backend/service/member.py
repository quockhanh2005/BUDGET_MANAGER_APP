from datetime import datetime
from backend.utils.database import db_instance
from backend.service.wallet import WalletService

class MemberService:
    def __init__(self):
        # Collections
        self.db_member = db_instance.get_db("member")
        self.user_collection = self.db_member["user"]
        
        self.db_budget = db_instance.get_db("budget")
        self.budget_collection = self.db_budget["budget"]
        
        self.db_proposal = db_instance.get_db("proposal")
        self.proposal_collection = self.db_proposal["membership_proposals"]
        
        self.wallet_service = WalletService()

    def create_member(self, member_id: str, name: str, age: int, member_address: str, email: str = None):
        """
        Create a new member and an associated wallet in the database.
        """
        # Validate uniqueness by member_id (like CCCD)
        if self.user_collection.find_one({"member_id": member_id}):
            raise ValueError(f"Member with ID {member_id} already exists.")

        # Validate uniqueness by member_address
        if self.user_collection.find_one({"member_address": member_address}):
            raise ValueError(f"Member with wallet address {member_address} already exists.")

        member_data = {
            "member_id": member_id,
            "name": name,
            "age": age,
            "member_address": member_address,
            "role": "user",
            "email": email,
            "created_at": datetime.utcnow()
        }
        
        # Insert member
        self.user_collection.insert_one(member_data)

        # Create wallet simultaneously
        try:
            wallet_data = self.wallet_service.create_wallet(
                member_id=member_id,
                wallet_address=member_address
            )
            member_data["wallet"] = wallet_data
        except Exception as e:
            print(f"Warning: Failed to create wallet: {e}")
        
        # Convert _id to string for JSON serialization
        if "_id" in member_data:
            member_data["id"] = str(member_data.pop("_id"))
            
        return member_data

    def get_member_by_address(self, member_address: str):
        """
        Retrieve member information by their wallet address.
        """
        member = self.user_collection.find_one({"member_address": member_address})
        if member:
            # Convert _id to string for JSON serialization
            member["id"] = str(member.pop("_id"))
            # Fetch associated wallet
            try:
                wallet = self.wallet_service.get_wallet_by_address(member_address)
                if wallet:
                    member["wallet"] = wallet.model_dump()
            except Exception as e:
                print(f"Warning: Failed to fetch wallet for member: {e}")
                
            return member
        return None

    def get_all_members(self):
        """
        Retrieve all registered members.
        """
        members = list(self.user_collection.find())
        for m in members:
            m["id"] = str(m.pop("_id"))
        return members

    # --- Membership Related Logic (Merged from MembershipService) ---

    def get_my_budgets(self, wallet_address: str):
        """
        danh sách quỹ mà member đang tham gia
        """
        wallet_address = wallet_address.lower()
        query = {"members.address": wallet_address}
        cursor = self.budget_collection.find(query, {"_id": 0}).sort("created_at", -1)
        return list(cursor)

    def get_budget_details(self, budget_id: str):
        """ Xem chi tiết quỹ (Đã đồng bộ thông tin Tên thật từ bảng Member)"""
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