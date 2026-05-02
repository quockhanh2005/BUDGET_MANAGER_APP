
import asyncio
import os
from web3 import Web3
from backend.utils.database import db_instance
from datetime import datetime
import time

# ABI rút gọn để lấy thông tin thành viên
VAULT_ABI = [
    {"inputs": [], "name": "activeMemberCount", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"},
    {"inputs": [], "name": "threshold", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"},
    {"inputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "name": "members", "outputs": [{"internalType": "address", "name": "", "type": "address"}], "stateMutability": "view", "type": "function"}
]

async def sync_vaults_periodically():
    """Vòng lặp quét Blockchain để đồng bộ hóa thành viên và threshold"""
    rpc_url = os.getenv("RPC_URL")
    w3 = Web3(Web3.HTTPProvider(rpc_url))
    db = db_instance.get_db("budget")
    budget_collection = db["budgets"]
    
    print(f"[{datetime.now()}] Starting Sync Worker...")
    
    while True:
        try:
            # Lấy tất cả các quỹ có vault_address
            budgets = list(budget_collection.find({"vault_address": {"$exists": True, "$ne": "n/a"}}))
            
            for budget in budgets:
                vault_address = budget["vault_address"]
                try:
                    contract = w3.eth.contract(address=Web3.to_checksum_address(vault_address), abi=VAULT_ABI)
                    
                    # Lấy thông tin từ on-chain
                    on_chain_count = contract.functions.activeMemberCount().call()
                    on_chain_threshold = contract.functions.threshold().call()
                    
                    # Đồng bộ hóa danh sách thành viên và threshold
                    current_db_members = budget.get("members", [])
                    current_db_threshold = budget.get("threshold", 0) # Giả sử có lưu threshold ở budget level
                    
                    update_data = {}
                    
                    # Kiểm tra và cập nhật threshold
                    if current_db_threshold != on_chain_threshold:
                        print(f"Syncing vault {vault_address} threshold: DB={current_db_threshold}, On-chain={on_chain_threshold}")
                        update_data["threshold"] = on_chain_threshold

                    # Kiểm tra và cập nhật danh sách thành viên
                    if len(current_db_members) != on_chain_count:
                        print(f"Syncing vault {vault_address} members: DB={len(current_db_members)}, On-chain={on_chain_count}")
                        
                        new_members = []
                        for i in range(on_chain_count):
                            addr = contract.functions.members(i).call()
                            existing = next((m for m in current_db_members if m.get("address", "").lower() == addr.lower()), None)
                            if existing:
                                new_members.append(existing)
                            else:
                                new_members.append({
                                    "name": f"Member {addr[:6]}",
                                    "address": addr.lower(),
                                    "role": "member",
                                    "avatar": "U"
                                })
                        update_data["members"] = new_members
                    
                    if update_data:
                        budget_collection.update_one(
                            {"id": budget["id"]},
                            {"$set": update_data}
                        )
                except Exception as e:
                    print(f"Error syncing vault {vault_address}: {str(e)}")
            
            # Chờ 30 giây trước lần quét tiếp theo
            await asyncio.sleep(30)
            
        except Exception as e:
            print(f"Sync Worker Error: {str(e)}")
            await asyncio.sleep(60)

def start_sync_worker():
    """Khởi tạo worker trong một luồng riêng biệt"""
    loop = asyncio.get_event_loop()
    loop.create_task(sync_vaults_periodically())
