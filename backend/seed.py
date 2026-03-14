from backend.database import SessionLocal, engine, Base
from backend.models import User
import bcrypt

Base.metadata.create_all(bind=engine)

db = SessionLocal()

# Check if admin already exists
existing = db.query(User).filter(User.username == "admin").first()
if existing:
    print("Admin user already exists.")
else:
    password_hash = bcrypt.hashpw("admin123".encode(), bcrypt.gensalt()).decode()
    admin = User(
        name="Administrator",
        username="admin",
        password_hash=password_hash,
        is_admin=True,
    )
    db.add(admin)
    db.commit()
    print("✅ Admin user created. Username: admin / Password: admin123")

existing = db.query(User).filter(User.username == "employee").first()
if existing:
    print("Employee user already exists.")
else:
    password_hash = bcrypt.hashpw("employee123".encode(), bcrypt.gensalt()).decode()
    employee = User(
        name="Employee",
        username="employee",
        password_hash=password_hash,
        is_admin=False,
    )
    db.add(employee)
    db.commit()
    print("✅ Employee user created. Username: employee / Password: employee123")

    

db.close()