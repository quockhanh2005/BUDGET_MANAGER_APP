from datetime import datetime
from backend.utils.database import db_instance
from backend.models.wallet import WalletCreate, WalletResponse

class WalletService:
    def __init__(self):
        self.db = db_instance.get_db("wallet")
        self.collection = self.db["wallet"]
        self.history_collection = self.db["transaction_history"]

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

    def save_transaction(self, tx_data: dict):
        """
        Save a new transaction to the history.
        """
        tx_data["created_at"] = datetime.utcnow()
        if "wallet_address" in tx_data:
            tx_data["wallet_address"] = tx_data["wallet_address"].lower()
            
        result = self.history_collection.insert_one(tx_data)
        return str(result.inserted_id)

    def get_transaction_history(self, wallet_address: str):
        """
        Get all transactions for a specific wallet.
        """
        wallet_address = wallet_address.lower()
        cursor = self.history_collection.find({"wallet_address": wallet_address}).sort("created_at", -1)
        
        history = []
        for doc in cursor:
            doc["id"] = str(doc.pop("_id"))
            if "created_at" in doc:
                doc["date"] = doc["created_at"].isoformat()
            history.append(doc)
        return history

    def save_dual_transaction(self, from_address: str, to_address: str, amount: float, title: str, hash: str, gas_fee: float = 0.0):
        """
        Save transaction records for both sender and receiver.
        """
        now = datetime.utcnow()
        
        # 1. Record for sender (Expense)
        sender_tx = {
            "wallet_address": from_address.lower(),
            "title": f"Chuyển tiền: {title}",
            "amount": -abs(amount),
            "type": "expense",
            "hash": hash,
            "gas_fee": gas_fee,
            "created_at": now
        }
        
        # 2. Record for receiver (Income)
        receiver_tx = {
            "wallet_address": to_address.lower(),
            "title": f"Nhận tiền: {title}",
            "amount": abs(amount),
            "type": "income",
            "hash": hash,
            "gas_fee": 0.0, # Receiver doesn't pay gas
            "created_at": now
        }
        
        self.history_collection.insert_one(sender_tx)
        self.history_collection.insert_one(receiver_tx)
        return True


