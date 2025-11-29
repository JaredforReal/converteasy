# ...existing code...
##############################################
# Stage 1: Build Node Application
##############################################
FROM node:18-slim as node-builder

WORKDIR /app

# 安装构建所需工具（如果有 native 模块）
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 复制 package 文件（包括 package-lock.json）
COPY package*.json ./
COPY tsconfig.json ./

# 安装所有依赖（用于构建）
RUN npm ci && npm cache clean --force

# 复制源代码
COPY src ./src

# 构建 TypeScript 项目
RUN npm run build

# 验证构建结果
RUN ls -la dist/

# 清理 devDependencies
RUN npm prune --production

# ...existing code...
##############################################
# Stage 2: Build Python Dependencies
##############################################
FROM python:3.11-slim as python-builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ libcairo2-dev libffi-dev pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir -U pip && \
    /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

# ...existing code...
##############################################
# Stage 3: Runtime
##############################################
FROM node:18-slim

ENV PYTHON_PATH=/opt/venv/bin/python3 \
    NODE_ENV=production

WORKDIR /app

# 只安装运行时依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv \
    ca-certificates \
    libcairo2 \
    libffi8 \
    libglib2.0-0 \
    libreoffice-core-nogui \
    libreoffice-writer-nogui \
    libreoffice-calc-nogui \
    libreoffice-impress-nogui \
    fonts-liberation \
    ffmpeg \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 复制构建产物（node_modules 与 dist 必须是为相同 libc 构建的）
COPY --from=node-builder /app/dist ./dist
COPY --from=node-builder /app/node_modules ./node_modules
COPY --from=node-builder /app/package*.json ./

# 直接复制整个 venv（避免遗漏可执行脚本）
COPY --from=python-builder /opt/venv /opt/venv
# 确保 venv 中存在 python3 可执行文件（有时虚拟环境可能只包含 python3.11 等具体文件名）
RUN if [ -d /opt/venv/bin ]; then \
            if [ ! -f /opt/venv/bin/python3 ] && [ -f /opt/venv/bin/python3.11 ]; then \
                ln -s /opt/venv/bin/python3.11 /opt/venv/bin/python3 || true; \
            fi; \
        fi || true

# 复制脚本
COPY src/scripts ./src/scripts

# 复制证书脚本并确保 initenv.sh 存在且可执行（K8s lifecycle hook 需要）
COPY cert /app/cert
RUN if [ -f /app/cert/initenv.sh ]; then chmod +x /app/cert/initenv.sh; fi

# 如果构建上下文包含证书，把证书在镜像构建时加入系统受信任证书，
# 并用一个快速的、无阻塞的 initenv 覆盖掉可能包含耗资源操作的脚本，
# 以避免运行时 lifecycle hook 调用诸如 update-ca-certificates 导致 OOM(Exit 137) 的问题。
RUN if [ -f /app/cert/certificate.crt ]; then \
            cp /app/cert/certificate.crt /usr/local/share/ca-certificates/ 2>/dev/null || true; \
            update-ca-certificates || true; \
        fi && \
        if [ -f /app/cert/initenv.sh ]; then \
            /bin/sh -c "printf '%s\n' '#!/bin/sh' '# baked safe initenv - quick no-op to avoid heavy runtime tasks' 'set -e' '# ensure uploads directory exists' '[ -d /app/uploads ] || mkdir -p /app/uploads' 'chmod 700 /app/uploads || true' 'echo \"[initenv] baked safe initenv - done\"' 'exit 0' > /app/cert/initenv.sh" && \
            chmod +x /app/cert/initenv.sh; \
        fi

# 创建目录
RUN mkdir -p uploads public

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s \
    CMD node -e "require('http').get('http://localhost:8080/health',(r)=>{process.exit(r.statusCode===200?0:1)})"

EXPOSE 8080

# 使用 JSON exec form（数组），避免被 /bin/sh 当作单一字符串执行
CMD ["node", "dist/index.js"]
# ...existing code...