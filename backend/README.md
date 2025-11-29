## wx-convert-backend

Node.js + Express 的文件格式转换后端，支持：

- POST `/convert/upload` 表单上传（`file`, `category`, `target`）
- GET `/convert/task/:taskId` 查询任务状态与下载地址
- 静态下载：`/public/*`

### 快速开始

1. 安装依赖
   ```bash
   cd backend
   npm i
   ```
2. 安装外部依赖
   - FFmpeg：用于音频转换（Windows 可用 `choco install ffmpeg`，或从官网下载安装）
   - LibreOffice：用于文档转换
     - Windows 安装包：https://www.libreoffice.org/download/download-libreoffice/
     - 安装完成后，将 `soffice.exe` 所在目录加入系统 PATH，或在启动命令前设置环境变量：
       - PowerShell（临时）：`$env:SOFFICE_PATH = 'C:\\Program Files\\LibreOffice\\program\\soffice.exe'`
       - CMD（临时）：`set SOFFICE_PATH=C:\\Program Files\\LibreOffice\\program\\soffice.exe`
       - 永久方式：系统高级设置 -> 环境变量
     - 若未在 PATH 中，后端会报错 `'soffice' is not recognized ...`，此时请按上面方式设置。
3. 启动
   ```bash
   npm run dev
   # or
   PORT=3001 npm run dev
   ```

### 环境变量

- `PORT`（默认 3001）
- `PUBLIC_DIR`（默认 `public`）转换结果会输出并通过 `/public` 提供
- `UPLOAD_DIR`（默认 `uploads`）
- `FFMPEG_PATH`（默认 `ffmpeg`）
- `SOFFICE_PATH`（默认 `soffice`）
  - Windows 示例：`C:\\Program Files\\LibreOffice\\program\\soffice.exe`

### 安全

- Helmet、CORS（默认允许本机预览环境）
- 速率限制：每分钟 120 次
- multer 限制：50MB，并按 `category` 做扩展名白名单
- 强烈建议生产部署时使用对象存储与鉴权下载 URL

### 与小程序对接

- 将小程序的 `miniprogram/app.js` 中 `apiBaseUrl` 指向后端地址，如 `http://127.0.0.1:3001`
- 按约定上传并轮询即可
