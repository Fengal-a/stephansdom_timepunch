FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY pyproject.toml .
RUN pip install --no-cache-dir ".[standard]" psycopg2-binary bcrypt

# Copy source
COPY backend/ ./backend/
COPY uploads/ ./uploads/

EXPOSE 8000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
