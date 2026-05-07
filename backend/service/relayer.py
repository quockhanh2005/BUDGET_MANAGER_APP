
from web3 import Web3
import os
import json
from backend.utils.database import db_instance
from datetime import datetime
from decimal import Decimal

# ABI rút gọn cho các hàm thực thi
SHARED_VAULT_ABI = [
    {
        "inputs": [
            {"internalType": "address payable", "name": "_to", "type": "address"},
            {"internalType": "uint256", "name": "_amount", "type": "uint256"},
            {"internalType": "uint256", "name": "_categoryId", "type": "uint256"},
            {"internalType": "uint256", "name": "_nonce", "type": "uint256"},
            {"internalType": "uint256", "name": "_deadline", "type": "uint256"},
            {"internalType": "bytes[]", "name": "_signatures", "type": "bytes[]"}
        ],
        "name": "executeWithdraw",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {"internalType": "uint256", "name": "_categoryId", "type": "uint256"},
            {"internalType": "uint256", "name": "_limitAmount", "type": "uint256"},
            {"internalType": "uint256", "name": "_nonce", "type": "uint256"},
            {"internalType": "uint256", "name": "_deadline", "type": "uint256"},
            {"internalType": "bytes[]", "name": "_signatures", "type": "bytes[]"}
        ],
        "name": "executeSetCategoryLimit",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {"internalType": "address", "name": "_newMember", "type": "address"},
            {"internalType": "uint256", "name": "_newThreshold", "type": "uint256"},
            {"internalType": "uint256", "name": "_nonce", "type": "uint256"},
            {"internalType": "uint256", "name": "_deadline", "type": "uint256"},
            {"internalType": "bytes[]", "name": "_signatures", "type": "bytes[]"}
        ],
        "name": "executeAddMember",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {"internalType": "address", "name": "_oldMember", "type": "address"},
            {"internalType": "uint256", "name": "_newThreshold", "type": "uint256"},
            {"internalType": "uint256", "name": "_nonce", "type": "uint256"},
            {"internalType": "uint256", "name": "_deadline", "type": "uint256"},
            {"internalType": "bytes[]", "name": "_signatures", "type": "bytes[]"}
        ],
        "name": "executeRemoveMember",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
]

EXPENSE_MANAGER_ABI = [
    {
        "inputs": [
            {"internalType": "address", "name": "_vault", "type": "address"},
            {"internalType": "uint256", "name": "_categoryId", "type": "uint256"}
        ],
        "name": "getCategoryInfo",
        "outputs": [
            {"internalType": "uint256", "name": "limitAmount", "type": "uint256"},
            {"internalType": "uint256", "name": "amountSpent", "type": "uint256"},
            {"internalType": "uint256", "name": "remaining", "type": "uint256"},
            {"internalType": "bool", "name": "isActive", "type": "bool"}
        ],
        "stateMutability": "view",
        "type": "function"
    }
]

class RelayerService:
    def __init__(self):
        self.rpc_url = os.getenv("RPC_URL")
        self.private_key = os.getenv("PRIVATE_KEY")
        self.w3 = Web3(Web3.HTTPProvider(self.rpc_url))
        self.account = self.w3.eth.account.from_key(self.private_key)
        self.user_collection = db_instance.get_db("member")["user"]

    def execute_withdraw_auto(self, vault_address: str, to: str, amount_eth: float, category_id: int, nonce: int, deadline: int, signatures: list, proposer_address: str):
        """Tự động thực thi rút tiền từ Backend"""
        try:
            print(f"Relayer: Executing withdrawal for {vault_address}...")
            contract = self.w3.eth.contract(address=Web3.to_checksum_address(vault_address), abi=SHARED_VAULT_ABI)
            
            amount_wei = self.w3.to_wei(amount_eth, 'ether')
            
            # Xây dựng transaction
            tx = contract.functions.executeWithdraw(
                Web3.to_checksum_address(to),
                amount_wei,
                category_id,
                nonce,
                deadline,
                [self.w3.to_bytes(hexstr=s) for s in signatures]
            ).build_transaction({
                'from': self.account.address,
                'nonce': self.w3.eth.get_transaction_count(self.account.address),
                'gas': 500000,
                'gasPrice': self.w3.eth.gas_price
            })
            
            # Ký và gửi
            signed_tx = self.w3.eth.account.sign_transaction(tx, private_key=self.private_key)
            tx_hash = self.w3.eth.send_raw_transaction(signed_tx.rawTransaction).hex()
            
            # Chờ xác nhận
            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            
            if receipt.status == 0:
                print(f"Relayer: Transaction REVERTED on-chain! {tx_hash}")
                return None, 0
                
            # Tính phí gas
            gas_used = receipt.gasUsed
            gas_price = receipt.effectiveGasPrice if 'effectiveGasPrice' in receipt else tx.get('gasPrice', self.w3.eth.gas_price)
            gas_fee = float(self.w3.from_wei(gas_used * gas_price, 'ether'))

            # KHẤU TRỪ PHÍ GAS VÀO ĐỊA CHỈ NGƯỜI TẠO ĐỀ XUẤT (Ghi nhận vào hệ thống)
            self._charge_gas_to_proposer(proposer_address, gas_fee, tx_hash)

            return tx_hash, gas_fee
            
        except Exception as e:
            # THỬ LẠI VỚI PHIÊN BẢN CŨ (LEGACY) NẾU LỖI THAM SỐ
            if "Missing argument" in str(e) or "count mismatch" in str(e) or "function signature" in str(e):
                try:
                    print(f"Relayer: Retrying as LEGACY withdrawal for {vault_address}...")
                    contract = self.w3.eth.contract(address=Web3.to_checksum_address(vault_address), abi=SHARED_VAULT_ABI)
                    
                    amount_wei = self.w3.to_wei(amount_eth, 'ether')
                    
                    # Xây dựng transaction bản cũ (không có category_id)
                    tx = contract.functions.executeWithdraw(
                        Web3.to_checksum_address(to),
                        amount_wei,
                        nonce,
                        deadline,
                        [self.w3.to_bytes(hexstr=s) for s in signatures]
                    ).build_transaction({
                        'from': self.account.address,
                        'nonce': self.w3.eth.get_transaction_count(self.account.address),
                        'gas': 500000,
                        'gasPrice': self.w3.eth.gas_price
                    })
                    
                    signed_tx = self.w3.eth.account.sign_transaction(tx, private_key=self.private_key)
                    tx_hash = self.w3.eth.send_raw_transaction(signed_tx.rawTransaction).hex()
                    receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
                    
                    if receipt.status == 1:
                        gas_fee = float(self.w3.from_wei(receipt.gasUsed * (receipt.effectiveGasPrice if 'effectiveGasPrice' in receipt else self.w3.eth.gas_price), 'ether'))
                        self._charge_gas_to_proposer(proposer_address, gas_fee, tx_hash)
                        return tx_hash, gas_fee
                except Exception as legacy_e:
                    print(f"Relayer Legacy Error: {str(legacy_e)}")
            
            print(f"Relayer Error: {str(e)}")
            return None, str(e)

    def execute_add_member_auto(self, vault_address: str, new_member: str, new_threshold: int, nonce: int, deadline: int, signatures: list, proposer_address: str):
        """Tự động thực thi thêm thành viên từ Backend"""
        try:
            contract = self.w3.eth.contract(address=Web3.to_checksum_address(vault_address), abi=SHARED_VAULT_ABI)
            tx = contract.functions.executeAddMember(
                Web3.to_checksum_address(new_member),
                new_threshold,
                nonce,
                deadline,
                [self.w3.to_bytes(hexstr=s) for s in signatures]
            ).build_transaction({
                'from': self.account.address,
                'nonce': self.w3.eth.get_transaction_count(self.account.address),
                'gas': 300000,
                'gasPrice': self.w3.eth.gas_price
            })

            signed_tx = self.w3.eth.account.sign_transaction(tx, self.private_key)
            tx_hash = self.w3.eth.send_raw_transaction(signed_tx.raw_transaction)
            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)
            
            gas_used = receipt.gasUsed
            gas_price = receipt.effectiveGasPrice if 'effectiveGasPrice' in receipt else tx['gasPrice']
            actual_gas_fee_eth = float(self.w3.from_wei(gas_used * gas_price, 'ether'))

            self._charge_gas_to_proposer(proposer_address, actual_gas_fee_eth, receipt.transactionHash.hex())
            return receipt.transactionHash.hex(), actual_gas_fee_eth
        except Exception as e:
            print(f"Relayer Member Error: {str(e)}")
            return None, str(e)

    def execute_remove_member_auto(self, vault_address: str, old_member: str, new_threshold: int, nonce: int, deadline: int, signatures: list, proposer_address: str):
        """Tự động thực thi xóa thành viên từ Backend"""
        try:
            contract = self.w3.eth.contract(address=Web3.to_checksum_address(vault_address), abi=SHARED_VAULT_ABI)
            tx = contract.functions.executeRemoveMember(
                Web3.to_checksum_address(old_member),
                new_threshold,
                nonce,
                deadline,
                [self.w3.to_bytes(hexstr=s) for s in signatures]
            ).build_transaction({
                'from': self.account.address,
                'nonce': self.w3.eth.get_transaction_count(self.account.address),
                'gas': 300000,
                'gasPrice': self.w3.eth.gas_price
            })

            signed_tx = self.w3.eth.account.sign_transaction(tx, self.private_key)
            tx_hash = self.w3.eth.send_raw_transaction(signed_tx.raw_transaction)
            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)
            
            gas_used = receipt.gasUsed
            gas_price = receipt.effectiveGasPrice if 'effectiveGasPrice' in receipt else tx['gasPrice']
            actual_gas_fee_eth = float(self.w3.from_wei(gas_used * gas_price, 'ether'))

            self._charge_gas_to_proposer(proposer_address, actual_gas_fee_eth, receipt.transactionHash.hex())
            return receipt.transactionHash.hex(), actual_gas_fee_eth
        except Exception as e:
            print(f"Relayer Member Error: {str(e)}")
            return None, str(e)

    def execute_set_limit_auto(self, vault_address: str, category_id: int, limit_amount_eth: float, nonce: int, deadline: int, signatures: list, proposer_address: str):
        """Tự động thực thi thiết lập hạn mức từ Backend"""
        try:
            contract = self.w3.eth.contract(address=Web3.to_checksum_address(vault_address), abi=SHARED_VAULT_ABI)
            limit_amount_wei = self.w3.to_wei(limit_amount_eth, 'ether')
            
            tx = contract.functions.executeSetCategoryLimit(
                category_id,
                limit_amount_wei,
                nonce,
                deadline,
                [self.w3.to_bytes(hexstr=s) for s in signatures]
            ).build_transaction({
                'from': self.account.address,
                'nonce': self.w3.eth.get_transaction_count(self.account.address),
                'gas': 300000,
                'gasPrice': self.w3.eth.gas_price
            })

            signed_tx = self.w3.eth.account.sign_transaction(tx, private_key=self.private_key)
            tx_hash = self.w3.eth.send_raw_transaction(signed_tx.rawTransaction).hex()
            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

            if receipt.status == 0:
                print(f"Relayer: Limit Transaction REVERTED on-chain! {tx_hash}")
                return None, "Transaction reverted"

            gas_used = receipt.gasUsed
            gas_price = receipt.effectiveGasPrice if "effectiveGasPrice" in receipt else tx.get("gasPrice", self.w3.eth.gas_price)
            actual_gas_fee_eth = float(self.w3.from_wei(gas_used * gas_price, "ether"))

            self._charge_gas_to_proposer(proposer_address, actual_gas_fee_eth, tx_hash)
            return tx_hash, actual_gas_fee_eth
        except Exception as e:
            print(f"Relayer Limit Error: {str(e)}")
            return None, str(e)

    def _charge_gas_to_proposer(self, address: str, gas_fee: float, tx_hash: str):
        """Ghi nhận phí gas trừ vào 'tài khoản ảo' của người đề xuất trong hệ thống"""
        # Ở đây chúng ta sẽ lưu vào lịch sử chi tiêu của User trong DB
        self.user_collection.update_one(
            {"member_address": address.lower()},
            {
                "$inc": {"total_gas_spent": gas_fee},
                "$push": {"gas_history": {
                    "fee": gas_fee,
                    "tx_hash": tx_hash,
                    "timestamp": datetime.utcnow()
                }}
            },
            upsert=True
        )

    def get_category_info(self, vault_address: str, category_id: int):
        """Lấy thông tin hạn mức của một danh mục từ ExpenseManager"""
        try:
            expense_manager_address = os.getenv("EXPENSE_MANAGER_ADDRESS")
            if not expense_manager_address: return None
            
            contract = self.w3.eth.contract(address=Web3.to_checksum_address(expense_manager_address), abi=EXPENSE_MANAGER_ABI)
            info = contract.functions.getCategoryInfo(Web3.to_checksum_address(vault_address), category_id).call()
            
            return {
                "limit": float(self.w3.from_wei(info[0], 'ether')),
                "spent": float(self.w3.from_wei(info[1], 'ether')),
                "remaining": float(self.w3.from_wei(info[2], 'ether')),
                "is_active": info[3]
            }
        except Exception as e:
            print(f"Relayer Info Error: {str(e)}")
            return None

relayer_service = RelayerService()
