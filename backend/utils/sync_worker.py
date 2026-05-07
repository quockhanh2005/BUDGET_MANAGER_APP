import threading
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

def sync_single_vault(w3, budget, budget_collection):
    """Đồng bộ hóa dữ liệu cho một vault duy nhất (Synchronous)"""
    vault_address = budget.get("vault_address")
    if not vault_address or vault_address == 'n/a':
        return

    try:
        # Chạy các call view (web3.py call đồng bộ)
        contract = w3.eth.contract(address=Web3.to_checksum_address(vault_address), abi=VAULT_ABI)
        
        on_chain_count = contract.functions.activeMemberCount().call()
        on_chain_threshold = contract.functions.threshold().call()
        
        current_db_members = budget.get("members", [])
        current_db_threshold = budget.get("threshold", 0)
        
        update_data = {}
        
        if current_db_threshold != on_chain_threshold:
            print(f"Syncing vault {vault_address} threshold: {current_db_threshold} -> {on_chain_threshold}")
            update_data["threshold"] = on_chain_threshold

        if len(current_db_members) != on_chain_count:
            print(f"Syncing vault {vault_address} members: {len(current_db_members)} -> {on_chain_count}")
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

def sync_vaults_periodically():
    """Vòng lặp quét Blockchain (Chạy trong thread riêng)"""
    rpc_url = os.getenv("RPC_URL")
    if not rpc_url:
        print("RPC_URL not found in environment. Sync Worker stopped.")
        return

    # Khởi tạo Web3 trong thread này
    w3 = Web3(Web3.HTTPProvider(rpc_url))
    db = db_instance.get_db("budget")
    budget_collection = db["budgets"]
    
    print(f"[{datetime.now()}] Starting Threaded Sync Worker...")
    
    while True:
        try:
            budgets = list(budget_collection.find({"vault_address": {"$exists": True, "$ne": "n/a"}}))
            
            for budget in budgets:
                sync_single_vault(w3, budget, budget_collection)
            
            time.sleep(60)
            
        except Exception as e:
            print(f"Sync Worker Error: {str(e)}")
            time.sleep(60)

def start_sync_worker():
    """Khởi tạo worker trong một luồng (thread) thực sự biệt lập"""
    thread = threading.Thread(target=sync_vaults_periodically, daemon=True)
    thread.start()

