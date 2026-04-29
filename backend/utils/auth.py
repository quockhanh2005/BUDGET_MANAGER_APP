from eth_account.messages import encode_defunct
from eth_account import Account

def verify_eth_signature(address: str, signature: str, message: str) -> bool:
    """
    Xác minh chữ ký Ethereum có được tạo bởi chủ sở hữu của địa chỉ ví không.
    """
    try:
        # Mã hóa thông điệp theo tiêu chuẩn personal_sign của Ethereum
        encoded_msg = encode_defunct(text=message)
        
        # Khôi phục địa chỉ ví đã thực hiện ký thông điệp
        signer_address = Account.recover_message(encoded_msg, signature=signature)
        
        # So sánh địa chỉ khôi phục được với địa chỉ mong đợi (không phân biệt chữ hoa, chữ thường)
        return signer_address.lower() == address.lower()
    except Exception as e:
        print(f"Lỗi xác minh chữ ký: {e}")
        return False