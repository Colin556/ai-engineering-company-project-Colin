FROM python:3.12-slim

WORKDIR /app/api
RUN pip install --no-cache-dir uv==0.11.11
COPY services/api/requirements.txt ./requirements.txt
COPY services/api/requirements.lock ./requirements.lock
RUN uv pip install --system --no-cache -r requirements.txt -c requirements.lock
COPY services /app
COPY docs/event-schemas.json /docs/event-schemas.json
COPY pipelines/data /pipelines/data
EXPOSE 8000
CMD ["sh", "/app/start.sh"]