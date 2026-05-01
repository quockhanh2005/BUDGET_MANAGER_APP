from datetime import datetime
from backend.utils.database import db_instance
from backend.service.wallet import WalletService

class MemberService:
    def __init__(self):
        self.db = db_instance.get_db("member")
        self.collection = self.db["user"]
        self.wallet_service = WalletService()

    def create_member(self, member_id: str, name: str, age: int, member_address: str, email: str = None):
        """
        Create a new member and an associated wallet in the database.
        """
        # Validate uniqueness by member_id (like CCCD)
        if self.collection.find_one({"member_id": member_id}):
            raise ValueError(f"Member with ID {member_id} already exists.")

        # Validate uniqueness by member_address
        if self.collection.find_one({"member_address": member_address}):
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
        self.collection.insert_one(member_data)

        # Create wallet simultaneously
        try:
            wallet_data = self.wallet_service.create_wallet(
                member_id=member_id,
                wallet_address=member_address
            )
            member_data["wallet"] = wallet_data
        except Exception as e:
            # Note: In a real app, you might want to use a transaction here
            # to ensure both or neither are created.
            print(f"Warning: Failed to create wallet: {e}")
        
        # Convert _id to string for JSON serialization
        if "_id" in member_data:
            member_data["id"] = str(member_data.pop("_id"))
            
        return member_data

    def get_member_by_address(self, member_address: str):
        """
        Retrieve member information by their wallet address.
        """
        member = self.collection.find_one({"member_address": member_address})
        if member:
            # Convert _id to string for JSON serialization
            member["id"] = str(member.pop("_id"))
            # return document
            # Fetch associated wallet
            try:
                wallet = self.wallet_service.get_wallet_by_address(member_address)
                if wallet:
                    member["wallet"] = wallet.model_dump()
            except Exception as e:
                print(f"Warning: Failed to fetch wallet for member: {e}")
                
            return member
        return None