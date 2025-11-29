# syntax=docker/dockerfile:1.4
##############################################
# ConvertEasy Backend - Python FastAPI 版本
# 支持文档转换（PDF/Word/Excel/PPT）和音频转换
##############################################

ARG PYTHON_VERSION=3.11

##############################################
# Stage 1: 构建阶段
##############################################
FROM python:${PYTHON_VERSION}-slim AS builder

WORKDIR /app

# 安装构建依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ libcairo2-dev libffi-dev pkg-config \
    && rm -rf /var/lib/apt/lists/*

# 创建虚拟环境并安装依赖
COPY requirements.txt .
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir -U pip wheel \
    && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt \
    && find /opt/venv -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true \
    && find /opt/venv -type f -name "*.pyc" -delete 2>/dev/null || true

##############################################
# Stage 2: 运行时镜像
##############################################
FROM python:${PYTHON_VERSION}-slim AS runtime

# 镜像元数据
LABEL maintainer="ConvertEasy Team" \
      version="2.0.0" \
      description="File conversion service with FastAPI - document and audio support"

# 环境变量
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    PORT=8080 \
    HOST=0.0.0.0

WORKDIR /app

# 安装运行时依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    # 基础依赖
    ca-certificates \
    curl \
    # Python C 扩展运行时库
    libcairo2 \
    libffi8 \
    libglib2.0-0 \
    # LibreOffice 无头模式（文档转换）
    libreoffice-core-nogui \
    libreoffice-writer-nogui \
    libreoffice-calc-nogui \
    libreoffice-impress-nogui \
    # 字体支持
    fonts-liberation \
    fonts-noto-cjk \
    # 音频转换
    ffmpeg \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* \
    # 创建应用目录
    && mkdir -p /app/uploads /app/public \
    && chmod 755 /app/uploads /app/public

# 复制虚拟环境
COPY --from=builder /opt/venv /opt/venv

# 复制应用代码
COPY app ./app

# 复制证书配置（K8s lifecycle hook）
COPY cert /app/cert
RUN set -e; \
    if [ -f /app/cert/initenv.sh ]; then \
        chmod +x /app/cert/initenv.sh; \
    fi; \
    if [ -f /app/cert/certificate.crt ]; then \
        cp /app/cert/certificate.crt /usr/local/share/ca-certificates/ 2>/dev/null || true; \
        update-ca-certificates 2>/dev/null || true; \
    fi

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -fsS http://localhost:8080/health || exit 1

EXPOSE 8080

# 启动命令
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]