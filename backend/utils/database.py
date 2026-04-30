import os
import logging
from pymongo import MongoClient
from abc import ABC, abstractmethod
from backend import config

logger = logging.getLogger(__name__)

class DatabaseProvider(ABC):
    @abstractmethod
    def connect(self):
        """Establish a connection to the database."""
        pass

    @abstractmethod
    def get_db(self, db_name: str = None):
        """Return the database instance."""
        pass

    @abstractmethod
    def close(self):
        """Close the database connection."""
        pass

class MongoProvider(DatabaseProvider):
    def __init__(self):
        self.uri = config.MONGO_URI
        self.db_name = config.MONGO_DB_NAME
        self.client = None

    def connect(self):
        if not self.client:
            try:
                self.client = MongoClient(self.uri)
                # Force a connection check
                self.client.admin.command('ping')
                logger.info("Successfully connected to MongoDB")
            except Exception as e:
                logger.error(f"Failed to connect to MongoDB: {e}")
                raise e
        return self.client

    def get_db(self, db_name: str = None):
        if not self.client:
            self.connect()
        return self.client[db_name or self.db_name]

    def close(self):
        if self.client:
            self.client.close()
            self.client = None
            logger.info("MongoDB connection closed")

# Abstracting other possible databases
class SQLProvider(DatabaseProvider):
    def __init__(self):
        self.uri = os.getenv("SQL_URI")
        self.engine = None

    def connect(self):
        # Placeholder for SQL connection (SQLAlchemy or similar)
        logger.info("SQL connection simulation")
        pass

    def get_db(self, db_name: str = None):
        pass

    def close(self):
        pass

class DatabaseFactory:
    @staticmethod
    def get_provider(db_type: str) -> DatabaseProvider:
        db_type = db_type.lower()
        if db_type == "mongodb":
            return MongoProvider()
        elif db_type == "sql":
            return SQLProvider()
        else:
            raise ValueError(f"Unsupported database type: {db_type}")

# Singleton instance based on configuration
DATABASE_TYPE = config.DATABASE_TYPE
db_instance = DatabaseFactory.get_provider(DATABASE_TYPE)

# For backward compatibility or direct access if needed
Database = MongoProvider # Or a generic wrapper if preferred
