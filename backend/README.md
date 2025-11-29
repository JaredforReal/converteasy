# ConvertEasy Backend

一个基于 **Python FastAPI** 的高性能文件格式转换后端服务，支持多种文档和音频格式的相互转换。

## ✨ 特性

- 🚀 **FastAPI 框架**：高性能异步 Web 框架，自动生成 OpenAPI 文档
- 🔄 **丰富的转换支持**：PDF、Word、Excel、PPT、TXT、HTML 等文档格式互转
- 🎵 **音频转换**：MP3、WAV、AAC、FLAC、M4A、OGG 等音频格式互转
- ⚡ **异步任务处理**：支持并发任务限制，避免服务器过载
- 🛡️ **安全防护**：CORS 配置、速率限制、文件类型白名单
- 🧹 **自动清理**：定时清理过期文件，节省存储空间
- 🐳 **Docker 支持**：提供优化的多阶段构建 Dockerfile
- 📚 **API 文档**：自动生成 Swagger UI 和 ReDoc 文档

## 📋 支持的转换格式

### 文档转换

| 源格式   | 可转换为                                  |
| -------- | ----------------------------------------- |
| PDF      | DOC, DOCX, PPT, PPTX, XLS, XLSX, TXT, RTF |
| DOC/DOCX | PDF, TXT, RTF, ODT, HTML                  |
| XLS/XLSX | PDF, DOC, TXT, CSV, ODS                   |
| PPT/PPTX | PDF, ODP                                  |
| TXT      | DOC, DOCX, PDF, XLS, XLSX                 |
| HTML     | PDF, DOC, DOCX                            |

### 音频转换

| 源格式 | 可转换为                      |
| ------ | ----------------------------- |
| MP3    | WAV, AAC, FLAC, M4A, OGG, WMA |
| WAV    | MP3, AAC, FLAC, M4A, OGG, WMA |
| AAC    | MP3, WAV, M4A, FLAC           |
| FLAC   | WAV, MP3, AAC                 |
| OGG    | MP3, WAV, FLAC                |
| M4A    | MP3, WAV, AAC                 |

## 🚀 快速开始

### 1. 安装 Python 依赖

```bash
cd backend
pip install -r requirements.txt
```

或使用 conda：

```bash
conda create -n converteasy python=3.11
conda activate converteasy
pip install -r requirements.txt
```

### 2. 安装系统依赖

#### LibreOffice（文档转换）

**macOS:**

```bash
brew install --cask libreoffice
```

**Ubuntu/Debian:**

```bash
sudo apt-get install libreoffice-core libreoffice-writer libreoffice-calc libreoffice-impress
```

**Windows:**
下载安装包：https://www.libreoffice.org/download/download-libreoffice/

#### FFmpeg（音频转换）

**macOS:**

```bash
brew install ffmpeg
```

**Ubuntu/Debian:**

```bash
sudo apt-get install ffmpeg
```

**Windows:**

```powershell
choco install ffmpeg
```

### 3. 启动服务

**开发模式（热重载）：**

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8080
```

**生产模式：**

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8080 --workers 4
```

或直接运行：

```bash
python -m app.main
```

服务默认运行在 `http://localhost:8080`

📚 **API 文档**：
- Swagger UI: `http://localhost:8080/docs`
- ReDoc: `http://localhost:8080/redoc`

## 📡 API 接口

### 文件上传与转换

```http
POST /convert/upload
Content-Type: multipart/form-data

file: <文件>
category: document | audio
target: pdf | docx | mp3 | wav | ...
source: (可选) 源格式，用于校验
```

**响应：**

```json
{
  "taskId": "abc123...",
  "message": "任务已提交，正在处理中"
}
```

### 查询任务状态

```http
GET /convert/task/{taskId}
```

**响应：**

```json
{
  "state": "finished",
  "url": "http://localhost:8080/public/xxx.pdf",
  "downloadUrl": "http://localhost:8080/download/xxx.pdf",
  "previewUrl": "http://localhost:8080/preview/xxx.pdf"
}
```

任务状态：`queued` | `processing` | `finished` | `error`

### 获取支持的格式

```http
GET /supported-formats?category=document
```

### 检测文件可转换的目标格式

```http
POST /detect-targets
Content-Type: multipart/form-data

file: <文件>
category: document | audio
```

### 文件下载

```http
GET /download/{filename}
```

### 文件预览

```http
GET /preview/{filename}
```

### 健康检查

```http
GET /health
```

### 服务器状态

```http
GET /server-status
```

### 手动清理过期文件

```http
POST /cleanup
```

## ⚙️ 环境变量

| 变量名            | 默认值                  | 说明                       |
| ----------------- | ----------------------- | -------------------------- |
| `PORT`            | `8080`                  | 服务端口                   |
| `HOST`            | `0.0.0.0`               | 监听地址                   |
| `DEBUG`           | `false`                 | 调试模式                   |
| `PUBLIC_DIR`      | `public`                | 转换结果输出目录           |
| `UPLOAD_DIR`      | `uploads`               | 上传文件临时目录           |
| `PUBLIC_BASE_URL` | `http://localhost:8080` | 公网访问基础 URL           |
| `FFMPEG_PATH`     | `ffmpeg`                | FFmpeg 可执行文件路径      |
| `SOFFICE_PATH`    | `soffice`               | LibreOffice 可执行文件路径 |
| `PYTHON_PATH`     | `python`                | Python 解释器路径          |

**Windows 示例：**

```powershell
$env:SOFFICE_PATH = 'C:\Program Files\LibreOffice\program\soffice.exe'
$env:FFMPEG_PATH = 'C:\ffmpeg\bin\ffmpeg.exe'
```

## 🐳 Docker 部署

### 构建镜像

```bash
docker build -t converteasy-backend .
```

### 运行容器

```bash
docker run -d \
  -p 8080:8080 \
  -v $(pwd)/uploads:/app/uploads \
  -v $(pwd)/public:/app/public \
  -e PUBLIC_BASE_URL=https://your-domain.com \
  converteasy-backend
```

## 📁 项目结构

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py           # FastAPI 应用入口
│   ├── config.py         # 配置管理
│   ├── models.py         # Pydantic 数据模型
│   ├── routers/          # API 路由
│   │   ├── __init__.py
│   │   └── convert.py    # 转换相关接口
│   ├── middleware/       # 中间件
│   │   ├── __init__.py
│   │   └── rate_limiter.py
│   ├── utils/            # 工具函数
│   │   ├── __init__.py
│   │   ├── file_utils.py     # 文件操作
│   │   ├── converter.py      # 转换逻辑
│   │   └── task_manager.py   # 任务管理
│   └── scripts/          # Python 转换脚本
│       ├── pdf_to_doc.py
│       ├── pdf_to_txt.py
│       ├── pdf_to_xls.py
│       ├── pdf_to_ppt.py
│       ├── doc_to_html.py
│       ├── html_to_word.py
│       ├── html_to_pdf.py
│       ├── xls_to_doc.py
│       ├── xls_to_txt.py
│       ├── txt_to_word.py
│       ├── txt_to_xls.py
│       └── check_dependencies.py
├── uploads/              # 上传文件临时存储
├── public/               # 转换结果输出
├── cert/                 # 证书配置（K8s 部署用）
├── Dockerfile            # Docker 多阶段构建
└── requirements.txt      # Python 依赖
```

## 🔒 安全特性

- **CORS**：跨域资源共享配置
- **速率限制**：每分钟 120 次请求限制
- **文件大小限制**：最大 100MB
- **文件类型白名单**：按分类限制允许的文件扩展名
- **路径遍历防护**：下载接口防止目录遍历攻击

## 🧹 自动文件清理

- **清理间隔**：每小时执行一次
- **过期时间**：转换结果保留 24 小时
- **uploads 目录**：孤立文件超过 1 小时自动清理
- **启动时清理**：服务启动时执行全局清理

## 📊 性能配置

| 配置项         | 值     | 说明                 |
| -------------- | ------ | -------------------- |
| 最大并发转换数 | 2      | 避免服务器过载       |
| 转换超时时间   | 120 秒 | 单个任务最长执行时间 |
| 文件大小限制   | 100MB  | 上传文件最大大小     |

## 🤝 与前端/小程序对接

1. 将前端的 API 基础地址指向后端，如 `http://127.0.0.1:8080`
2. 调用 `/convert/upload` 上传文件
3. 轮询 `/convert/task/{taskId}` 获取转换结果
4. 转换完成后通过 `downloadUrl` 或 `previewUrl` 获取文件

## 📝 开发命令

```bash
# 开发模式（热重载）
uvicorn app.main:app --reload --port 8080

# 生产模式（多 worker）
uvicorn app.main:app --host 0.0.0.0 --port 8080 --workers 4

# 使用 gunicorn（推荐生产环境）
gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8080

# 检查 Python 依赖
python app/scripts/check_dependencies.py
```

## 📄 License

MIT
