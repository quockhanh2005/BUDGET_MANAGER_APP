import os
from dotenv import load_dotenv
from pathlib import Path

# Get the path to the project root
# backend/config.py -> backend/ -> root/
BASE_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BASE_DIR / ".env"

# Load environment variables from the root .env file
load_dotenv(dotenv_path=ENV_PATH)

# Database Configurations
MONGO_URI = os.getenv("MONGO_URI")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "budget_manager")
DATABASE_TYPE = os.getenv("DATABASE_TYPE", "mongodb")

# Blockchain Configurations
RPC_URL = os.getenv("RPC_URL")
VAULT_TEMPLATE_ADDRESS = os.getenv("VAULT_TEMPLATE_ADDRESS")
VAULT_FACTORY_ADDRESS = os.getenv("VAULT_FACTORY_ADDRESS")
