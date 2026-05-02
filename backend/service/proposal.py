
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

    def create_membership_proposal(self, budget_id: str, p_type: str, target_address: str, proposer_address: str, nonce: int, deadline: int, signature: str, new_threshold: int = None):
        """tạo đề xuất thành viên với chữ ký"""
        proposer_address = proposer_address.lower()
        target_address = target_address.lower()

        # Chỉ thành viên quỹ mới được tạo đề xuất
        budget = self.budget_collection.find_one({"id": budget_id, "members.address": proposer_address})
        if not budget:
            raise ValueError("Chỉ thành viên của quỹ mới có quyền tạo đề xuất.")

        # Nếu thêm người, người đó phải đã đăng ký tài khoản
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
            "nonce": nonce,
            "deadline": deadline,
            "new_threshold": new_threshold if new_threshold else budget.get("threshold", 1),
            "status": "pending",
            "signatures": [{
                "signer_address": proposer_address,
                "signature": signature,
                "created_at": datetime.utcnow()
            }],
            "created_at": datetime.utcnow()
        }
        self.proposal_collection.insert_one(data)
        if "_id" in data: del data["_id"]
        return data

    def approve_proposal(self, proposal_id: str, voter_address: str, signature: str):
        """duyệt đề xuất với chữ ký"""
        voter_address = voter_address.lower()
        proposal = self.proposal_collection.find_one({"id": proposal_id})
        if not proposal: raise ValueError("Không tìm thấy đề xuất")
        
        # Kiểm tra Voter có thuộc Quỹ này không?
        budget = self.budget_collection.find_one({"id": proposal["budget_id"], "members.address": voter_address})
        if not budget:
            raise ValueError("Bạn không có quyền duyệt vì không phải thành viên của quỹ này.")

        if proposal["status"] != "pending": raise ValueError("Đề xuất đã kết thúc")
        
        # Kiểm tra xem đã ký chưa, nếu có thì cập nhật chữ ký mới nhất
        signatures = proposal.get("signatures", [])
        found = False
        for sig in signatures:
            if sig["signer_address"] == voter_address:
                sig["signature"] = signature
                sig["created_at"] = datetime.utcnow()
                found = True
                break
        
        if not found:
            signatures.append({
                "signer_address": voter_address,
                "signature": signature,
                "created_at": datetime.utcnow()
            })

        self.proposal_collection.update_one(
            {"id": proposal_id}, 
            {"$set": {"signatures": signatures}}
        )
        updated_proposal = self.proposal_collection.find_one({"id": proposal_id}, {"_id": 0})
        
        # --- LOGIC TỰ ĐỘNG THỰC THI (AUTO-EXECUTE) ---
        budget = self.budget_collection.find_one({"id": updated_proposal["budget_id"]})
        if budget and updated_proposal["status"] == "pending":
            member_count = len(budget.get("members", []))
            sig_count = len(updated_proposal.get("signatures", []))
            
            # Kiểm tra điều kiện "Quá nửa" (More than 50%)
            if sig_count > member_count / 2:
                from backend.service.relayer import relayer_service
                
                print(f"Auto-executing membership proposal {proposal_id} (Sigs: {sig_count}/{member_count})")
                
                # Sắp xếp chữ ký theo địa chỉ (Quan trọng!)
                sorted_sigs = sorted(updated_proposal["signatures"], key=lambda x: x["signer_address"].lower())
                signatures_list = [s["signature"] for s in sorted_sigs]
                
                tx_hash, gas_fee = None, None
                if updated_proposal["type"] == "ADD_MEMBER":
                    tx_hash, gas_fee = relayer_service.execute_add_member_auto(
                        vault_address=budget["vault_address"],
                        new_member=updated_proposal["target_address"],
                        new_threshold=updated_proposal["new_threshold"],
                        nonce=updated_proposal["nonce"],
                        deadline=updated_proposal["deadline"],
                        signatures=signatures_list,
                        proposer_address=updated_proposal["proposer_address"]
                    )
                elif updated_proposal["type"] == "REMOVE_MEMBER":
                    tx_hash, gas_fee = relayer_service.execute_remove_member_auto(
                        vault_address=budget["vault_address"],
                        old_member=updated_proposal["target_address"],
                        new_threshold=updated_proposal["new_threshold"],
                        nonce=updated_proposal["nonce"],
                        deadline=updated_proposal["deadline"],
                        signatures=signatures_list,
                        proposer_address=updated_proposal["proposer_address"]
                    )
                
                if tx_hash:
                    self.execute_proposal(proposal_id, tx_hash)
                    return self.proposal_collection.find_one({"id": proposal_id}, {"_id": 0}), f"Tự động thực thi thành công! Phí gas {gas_fee} ETH đã được ghi nhận cho người đề xuất."

        return updated_proposal

    def cancel_membership_proposal(self, proposal_id: str, operator_address: str):
        """Hủy đề xuất (chỉ người tạo đề xuất hoặc owner quỹ mới có quyền)"""
        proposal = self.proposal_collection.find_one({"id": proposal_id})
        if not proposal: raise ValueError("Không tìm thấy đề xuất")
        
        # Kiểm tra quyền (phải là người tạo hoặc owner quỹ)
        is_creator = proposal["proposer_address"] == operator_address.lower()
        budget = self.budget_collection.find_one({"id": proposal["budget_id"], "members.address": operator_address.lower(), "members.role": "owner"})
        
        if not (is_creator or budget):
            raise ValueError("Bạn không có quyền hủy đề xuất này")

        self.proposal_collection.update_one(
            {"id": proposal_id},
            {"$set": {"status": "rejected", "updated_at": datetime.utcnow()}}
        )
        return {"status": "rejected", "message": "Đã hủy đề xuất"}

    def execute_proposal(self, proposal_id: str, tx_hash: str = None):
        """Thực thi đề xuất và đồng bộ dữ liệu"""
        proposal = self.proposal_collection.find_one({"id": proposal_id})
        if not proposal or proposal["status"] != "pending": raise ValueError("Đề xuất không hợp lệ")

        budget = self.budget_collection.find_one({"id": proposal["budget_id"]})
        
        # Kiểm tra Threshold (Tạm thời kiểm tra off-chain trước khi confirm on-chain)
        if len(proposal.get("signatures", [])) < budget.get("threshold", 1):
            raise ValueError("Chưa đủ chữ ký phê duyệt theo quy định của quỹ")

        # THỰC THI & ĐỒNG BỘ TÊN USER
        if proposal["type"] == "ADD_MEMBER":
            target = proposal["target_address"]
            user = self.user_collection.find_one({"member_address": {"$regex": f"^{target}$", "$options": "i"}})
            name = user.get("name", "Thành viên") if user else "Thành viên"
            
            self.budget_collection.update_one(
                {"id": proposal["budget_id"], "members.address": {"$ne": target}},
                {
                    "$push": {"members": {"address": target, "name": name, "role": "member", "avatar": name[0].upper()}},
                    "$set": {"threshold": proposal.get("new_threshold", budget.get("threshold", 1))}
                }
            )
        elif proposal["type"] == "REMOVE_MEMBER":
            self.budget_collection.update_one(
                {"id": proposal["budget_id"]}, 
                {
                    "$pull": {"members": {"address": proposal["target_address"]}},
                    "$set": {"threshold": proposal.get("new_threshold", budget.get("threshold", 1))}
                }
            )

        self.proposal_collection.update_one(
            {"id": proposal_id}, 
            {"$set": {
                "status": "executed", 
                "tx_hash": tx_hash,
                "updated_at": datetime.utcnow()
            }}
        )
        return {"status": "executed", "message": "Thực thi thành công"}
