FROM python:3.11-slim-bookworm AS build

# Đã xóa dòng đổi mirror apt sang Tsinghua

WORKDIR /opt/CTFd

RUN mkdir -p /opt/CTFd /var/log/CTFd /var/uploads

# hadolint ignore=DL3008
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        libffi-dev \
        libssl-dev \
        git \
        docker-compose \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && python -m venv /opt/venv

ENV PATH="/opt/venv/bin:$PATH"

COPY . /opt/CTFd

# Đã xóa cờ -i https://mirrors.tuna.tsinghua.edu.cn... trong các lệnh pip
RUN pip install --upgrade pip --use-pep517 --no-cache-dir \
    && pip install --no-cache-dir -r requirements.txt --use-pep517 --no-cache-dir \
    && for d in CTFd/plugins/*; do \
        if [ -f "$d/requirements.txt" ]; then \
            pip install --no-cache-dir -r "$d/requirements.txt" --use-pep517 --no-cache-dir;\
        fi; \
    done;


FROM python:3.11-slim-bookworm AS release

# Đã xóa dòng đổi mirror apt sang Tsinghua

WORKDIR /opt/CTFd

# hadolint ignore=DL3008
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libffi8 \
        libssl3 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY --chown=1001:1001 . /opt/CTFd

RUN useradd \
    --no-log-init \
    --shell /bin/bash \
    -u 1001 \
    ctfd \
    && mkdir -p /var/log/CTFd /var/uploads \
    && chown -R 1001:1001 /var/log/CTFd /var/uploads /opt/CTFd \
    && chmod +x /opt/CTFd/docker-entrypoint.sh

COPY --chown=1001:1001 --from=build /opt/venv /opt/venv

ENV PATH="/opt/venv/bin:$PATH"

USER 1001
EXPOSE 8000
CMD ["bash","/opt/CTFd/docker-entrypoint.sh"]
