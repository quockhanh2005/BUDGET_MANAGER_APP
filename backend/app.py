import sys
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Add the project root to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend import config

from backend.api.member import router as member_router
from backend.api.budget import router as budget_router
from backend.api.membership import router as membership_router
from backend.api.proposal import router as proposal_router
from backend.api.wallet import router as wallet_router


app = FastAPI(title="Budget Manager API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust this for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(member_router)
app.include_router(budget_router)

app.include_router(membership_router)
app.include_router(proposal_router)

app.include_router(wallet_router)


@app.on_event("startup")
async def startup_event():
    from backend.utils.sync_worker import start_sync_worker
    start_sync_worker()

@app.on_event("shutdown")
def shutdown_event():
    from backend.utils.database import db_instance
    db_instance.close()

@app.get("/")
def root():
    return {"message": "Budget Manager API is running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app:app", host="0.0.0.0", port=8000, reload=True)
