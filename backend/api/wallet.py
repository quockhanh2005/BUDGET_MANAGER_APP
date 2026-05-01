from fastapi import APIRouter, HTTPException, Query
from typing import List
from backend.service.wallet import WalletService
from backend.models.transaction import TransactionLog

router = APIRouter(prefix="/wallet", tags=["Wallet"])
wallet_service = WalletService()

@router.post("/history")
async def save_tx(tx: TransactionLog):
    try:
        tx_id = wallet_service.save_transaction(tx.model_dump())
        return {"status": "success", "id": tx_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/history")
async def get_tx_history(address: str = Query(...)):
    try:
        history = wallet_service.get_transaction_history(address)
        return history
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
