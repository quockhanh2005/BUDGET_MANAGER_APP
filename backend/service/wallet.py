from datetime import datetime
from backend.utils.database import db_instance
from backend.models.wallet import WalletCreate, WalletResponse

class WalletService:
    def __init__(self):
        self.db = db_instance.get_db("wallet")
        self.collection = self.db["wallet"]

    def create_wallet(self, member_id: str, wallet_address: str) -> WalletResponse:
        """
        Create a new wallet for a member.
        """
        # Check if wallet already exists for this address
        if self.collection.find_one({"wallet_address": wallet_address}):
            raise ValueError(f"Wallet with address {wallet_address} already exists.")

        # Prepare creation data
        wallet_create = WalletCreate(
            member_id=member_id,
            wallet_address=wallet_address,
            balance=0.0,
            currency="ETH",
            status="active"
        )
        
        wallet_data = wallet_create.model_dump()
        wallet_data["created_at"] = datetime.utcnow()
        wallet_data["updated_at"] = datetime.utcnow()
        
        # Insert into DB
        result = self.collection.insert_one(wallet_data)
        
        # Convert to response model
        wallet_data["id"] = str(result.inserted_id)
        return WalletResponse(**wallet_data)

    def get_wallet_by_address(self, wallet_address: str) -> WalletResponse:
        """
        Retrieve wallet info by address.
        """
        wallet_data = self.collection.find_one({"wallet_address": wallet_address})
        if wallet_data:
            wallet_data["id"] = str(wallet_data.pop("_id"))
            return WalletResponse(**wallet_data)
        return None


