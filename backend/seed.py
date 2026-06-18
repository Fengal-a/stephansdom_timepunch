from backend.database import SessionLocal, engine, Base
from backend.models import User, TimeEntry, Message
import bcrypt

Base.metadata.create_all(bind=engine)

db = SessionLocal()

# Wipe all existing data
db.query(Message).delete()
db.query(TimeEntry).delete()
db.query(User).delete()
db.commit()

# Create admin
pw = bcrypt.hashpw("xRaPj5ye".encode(), bcrypt.gensalt()).decode()
db.add(User(name="Administrator", username="admin", password_hash=pw, is_admin=True))
db.commit()
print("✅ Admin created — admin / xRaPj5ye")

db.close()
