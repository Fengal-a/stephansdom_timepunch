from backend.database import SessionLocal, engine, Base
from backend.models import User, TimeEntry
from datetime import datetime, timezone, timedelta
import bcrypt
import random

Base.metadata.create_all(bind=engine)

db = SessionLocal()

random.seed(42)

# ── Admin ─────────────────────────────────────────────────────────────────────

existing = db.query(User).filter(User.username == "admin").first()
if existing:
    print("Admin user already exists.")
else:
    pw = bcrypt.hashpw("admin123".encode(), bcrypt.gensalt()).decode()
    db.add(User(name="Administrator", username="admin", password_hash=pw, is_admin=True))
    db.commit()
    print("✅ Admin created  — admin / admin123")

# ── Employees ─────────────────────────────────────────────────────────────────

EMPLOYEES = [
    ("Anna Müller",    "mueller"),
    ("Thomas Huber",   "huber"),
    ("Lisa Wagner",    "wagner"),
    ("Stefan Bauer",   "bauer"),
]

users = []
for name, uname in EMPLOYEES:
    existing = db.query(User).filter(User.username == uname).first()
    if existing:
        print(f"User {uname} already exists.")
        users.append(existing)
    else:
        pw = bcrypt.hashpw("mitarbeiter123".encode(), bcrypt.gensalt()).decode()
        u = User(name=name, username=uname, password_hash=pw, is_admin=False)
        db.add(u)
        db.commit()
        db.refresh(u)
        users.append(u)
        print(f"✅ Employee created — {uname} / mitarbeiter123")

# ── Time entries for March 2026 ───────────────────────────────────────────────
# Skip if entries already exist for these users in March

MARCH_START = datetime(2026, 3, 1, tzinfo=timezone.utc)
already = db.query(TimeEntry).filter(
    TimeEntry.punch_in >= MARCH_START,
    TimeEntry.user_id.in_([u.id for u in users]),
).first()

if already:
    print("March entries already exist, skipping.")
else:
    # Work Mon–Fri each week; each employee randomly skips ~2 days in the month
    work_days = [
        # Week 1
        datetime(2026, 3,  2, tzinfo=timezone.utc),
        datetime(2026, 3,  3, tzinfo=timezone.utc),
        datetime(2026, 3,  4, tzinfo=timezone.utc),
        datetime(2026, 3,  5, tzinfo=timezone.utc),
        datetime(2026, 3,  6, tzinfo=timezone.utc),
        # Week 2
        datetime(2026, 3,  9, tzinfo=timezone.utc),
        datetime(2026, 3, 10, tzinfo=timezone.utc),
        datetime(2026, 3, 11, tzinfo=timezone.utc),
        datetime(2026, 3, 12, tzinfo=timezone.utc),
        datetime(2026, 3, 13, tzinfo=timezone.utc),
        # Week 3
        datetime(2026, 3, 16, tzinfo=timezone.utc),
        datetime(2026, 3, 17, tzinfo=timezone.utc),
        datetime(2026, 3, 18, tzinfo=timezone.utc),
        datetime(2026, 3, 19, tzinfo=timezone.utc),
        datetime(2026, 3, 20, tzinfo=timezone.utc),
        # Week 4
        datetime(2026, 3, 23, tzinfo=timezone.utc),
        datetime(2026, 3, 24, tzinfo=timezone.utc),
        datetime(2026, 3, 25, tzinfo=timezone.utc),
        datetime(2026, 3, 26, tzinfo=timezone.utc),
        datetime(2026, 3, 27, tzinfo=timezone.utc),
        # Week 5
        datetime(2026, 3, 30, tzinfo=timezone.utc),
        datetime(2026, 3, 31, tzinfo=timezone.utc),
    ]

    NOTES = [None, None, None, "Überstunden", "Mittagspause verlängert", "Früher gegangen", None]

    for u in users:
        # Each employee skips 2 random days
        days_off = set(random.sample(range(len(work_days)), 2))
        for i, day in enumerate(work_days):
            if i in days_off:
                continue
            # Start between 07:00 and 09:00
            start_hour   = random.randint(7, 8)
            start_minute = random.choice([0, 15, 30, 45])
            # Work 6–8 hours
            duration_min = random.randint(360, 480)

            punch_in  = day.replace(hour=start_hour, minute=start_minute)
            punch_out = punch_in + timedelta(minutes=duration_min)

            entry = TimeEntry(
                user_id          = u.id,
                punch_in         = punch_in,
                punch_out        = punch_out,
                duration_minutes = duration_min,
                note             = random.choice(NOTES),
            )
            db.add(entry)

    db.commit()
    print("✅ March 2026 time entries created for all employees.")

db.close()
