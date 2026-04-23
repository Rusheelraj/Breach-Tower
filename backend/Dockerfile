FROM python:3.12-slim

WORKDIR /app

# requirements.txt is inside the backend folder (build context is project root)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy entire project so imports like 'from backend.db...' resolve correctly
COPY . .

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
