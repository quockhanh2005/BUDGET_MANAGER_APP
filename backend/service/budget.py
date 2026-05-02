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
        self.withdraw_collection = self.db["withdraw_requests"] # Collection mới cho multi-sig
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

    def create_withdraw_request(self, budget_id: str, creator_address: str, data: dict):
        request_id = str(uuid.uuid4())
        new_request = {
            "id": request_id,
            "budget_id": budget_id,
            "title": data.get("title", "Rút tiền"),
            "creator_address": creator_address.lower(),
            "to": data["to"].lower(),
            "amount": data["amount"],
            "nonce": data["nonce"],
            "deadline": data["deadline"],
            "signatures": [{
                "signer_address": creator_address.lower(),
                "signature": data["signature"],
                "created_at": datetime.utcnow()
            }],
            "status": "pending",
            "created_at": datetime.utcnow()
        }
        
        self.withdraw_collection.insert_one(new_request)
        if "_id" in new_request: del new_request["_id"]
        return new_request

    def get_withdraw_requests(self, budget_id: str):
        requests = list(self.withdraw_collection.find({"budget_id": budget_id}, {"_id": 0}))
        return requests

    def add_withdraw_signature(self, request_id: str, signer_address: str, signature: str):
        signer_address = signer_address.lower()
        
        # Kiểm tra xem đã ký chưa
        request = self.withdraw_collection.find_one({"id": request_id})
        if not request:
            return None, "Yêu cầu không tồn tại"
            
        # Kiểm tra và cập nhật chữ ký nếu đã tồn tại
        signatures = request.get("signatures", [])
        found = False
        for sig in signatures:
            if sig["signer_address"] == signer_address:
                sig["signature"] = signature
                sig["created_at"] = datetime.utcnow()
                found = True
                break
        
        if not found:
            signatures.append({
                "signer_address": signer_address,
                "signature": signature,
                "created_at": datetime.utcnow()
            })

        self.withdraw_collection.update_one(
            {"id": request_id},
            {"$set": {"signatures": signatures}}
        )
        
        updated_request = self.withdraw_collection.find_one({"id": request_id}, {"_id": 0})
        
        # --- LOGIC TỰ ĐỘNG THỰC THI (AUTO-EXECUTE) ---
        budget = self.collection.find_one({"id": updated_request["budget_id"]})
        if budget and updated_request["status"] == "pending":
            member_count = len(budget.get("members", []))
            sig_count = len(updated_request.get("signatures", []))
            
            # Kiểm tra điều kiện "Quá nửa" (More than 50%)
            if sig_count > member_count / 2:
                from backend.service.relayer import relayer_service
                
                print(f"Auto-executing withdrawal {request_id} (Sigs: {sig_count}/{member_count})")
                
                # Sắp xếp chữ ký theo địa chỉ (Quan trọng!)
                sorted_sigs = sorted(updated_request["signatures"], key=lambda x: x["signer_address"].lower())
                signatures_list = [s["signature"] for s in sorted_sigs]

                tx_hash, gas_fee = relayer_service.execute_withdraw_auto(
                    vault_address=budget["vault_address"],
                    to=updated_request["to"],
                    amount_eth=updated_request["amount"],
                    nonce=updated_request["nonce"],
                    deadline=updated_request["deadline"],
                    signatures=signatures_list,
                    proposer_address=updated_request["creator_address"]
                )
                
                if tx_hash:
                    self.mark_withdraw_executed(request_id, tx_hash)
                    return self.withdraw_collection.find_one({"id": request_id}, {"_id": 0}), f"Tự động thực thi thành công! Phí gas {gas_fee} ETH đã được ghi nhận cho người đề xuất."

        return updated_request, "Thành công"

    def cancel_withdraw_request(self, request_id: str, operator_address: str):
        request = self.withdraw_collection.find_one({"id": request_id})
        if not request: return False, "Yêu cầu không tồn tại"
        
        # Quyền: Người tạo hoặc Owner quỹ
        is_creator = request["creator_address"] == operator_address.lower()
        budget = self.collection.find_one({"id": request["budget_id"], "members.address": operator_address.lower(), "members.role": "owner"})
        
        if not (is_creator or budget):
            return False, "Bạn không có quyền hủy yêu cầu này"

        self.withdraw_collection.update_one(
            {"id": request_id},
            {"$set": {"status": "rejected"}}
        )
        return True, "Đã hủy yêu cầu"

    def mark_withdraw_executed(self, request_id: str, tx_hash: str):
        self.withdraw_collection.update_one(
            {"id": request_id},
            {"$set": {
                "status": "executed",
                "tx_hash": tx_hash,
                "executed_at": datetime.utcnow()
            }}
        )
        return True

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

        # 3. Kiểm tra quyền Owner (Người tạo hoặc người có role owner trong quỹ)
        is_owner = budget.get("creator_address", "").lower() == operator_address
        if not is_owner:
            for m in budget.get("members", []):
                if m.get("address", "").lower() == operator_address and m.get("role", "").lower() == "owner":
                    is_owner = True
                    break

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

    def deposit_to_budget(self, budget_id: str, deposit_data: dict):
        """
        Xử lý nạp tiền vào quỹ:
        - Cập nhật số dư trong budget
        - Lưu lịch sử giao dịch vào transaction_history
        - Lưu log vào danh sách transactions của budget
        """
        budget = self.collection.find_one({"id": budget_id})
        if not budget:
            return None, "Không tìm thấy quỹ"

        amount = deposit_data.get("amount", 0.0)
        tx_hash = deposit_data.get("tx_hash", "")
        sender = deposit_data.get("sender_address", "").lower()
        gas_fee = deposit_data.get("gas_fee", 0.0)

        # 1. Tạo bản ghi giao dịch mới
        new_transaction = {
            "title": f"Nạp tiền vào quỹ từ {sender[:6]}...{sender[-4:]}",
            "amount": amount,
            "date": datetime.utcnow().isoformat(),
            "type": "deposit",
            "hash": tx_hash,
            "sender": sender
        }

        # 2. Cập nhật Budget (Tăng balance và thêm vào mảng transactions)
        result = self.collection.update_one(
            {"id": budget_id},
            {
                "$inc": {"balance": amount},
                "$push": {"transactions": {
                    "title": new_transaction["title"],
                    "amount": amount,
                    "date": new_transaction["date"],
                    "type": "deposit"
                }}
            }
        )

        if result.modified_count > 0:
            # 3. Lưu vào lịch sử giao dịch ví cá nhân (để hiện ở dashboard chính)
            self.wallet_service.save_transaction({
                "wallet_address": sender,
                "title": f"Nạp tiền vào quỹ: {budget['name']}",
                "amount": -amount, # Nạp vào quỹ là tiền đi ra khỏi ví chính
                "type": "expense",
                "hash": tx_hash,
                "gas_fee": gas_fee
            })
            
            updated_budget = self.collection.find_one({"id": budget_id}, {"_id": 0})
            return updated_budget, "Nạp tiền thành công"
            
        return None, "Lỗi khi cập nhật số dư quỹ"