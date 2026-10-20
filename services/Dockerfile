FROM python:3.12-slim

WORKDIR /app/api
RUN pip install --no-cache-dir uv==0.11.11
COPY api/requirements.txt ./requirements.txt
COPY api/requirements.lock ./requirements.lock
RUN uv pip install --system --no-cache -r requirements.txt -c requirements.lock
COPY . /app
EXPOSE 8000
CMD ["sh", "/app/start.sh"]