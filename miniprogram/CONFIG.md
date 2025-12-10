# ConvertEase 小程序配置说明

## 服务信息

- **正式域名**: `https://convertease.site`
- **服务名称**: `converteasy-backend`
- **版本**: `2.0.0`

## 小程序后台配置

在微信公众平台 → 开发 → 开发管理 → 开发设置 → 服务器域名：

### request 合法域名

```
https://convertease.site
```

### uploadFile 合法域名

```
https://convertease.site
```

### downloadFile 合法域名

```
https://convertease.site
```

## API 端点

| 端点                                   | 方法 | 说明               |
| -------------------------------------- | ---- | ------------------ |
| `/health`                              | GET  | 健康检查           |
| `/supported-formats`                   | GET  | 查询支持的格式     |
| `/supported-formats?category=document` | GET  | 查询文档格式       |
| `/supported-formats?category=audio`    | GET  | 查询音频格式       |
| `/detect-targets`                      | POST | 检测文件可转换格式 |
| `/convert/upload`                      | POST | 上传并转换文件     |
| `/convert/task/{taskId}`               | GET  | 查询任务状态       |
| `/public/{filename}`                   | GET  | 下载/预览文件      |

## 文件说明

### `utils/api.js`

API 请求模块，纯 HTTP 方式，无云调用依赖。

```javascript
const BASE_URL = "https://convertease.site";
```

主要导出函数：

- `healthCheck()` - 健康检查
- `loadSupportedFormats(category)` - 加载支持的格式
- `createDocumentConvertTask(params)` - 创建文档转换任务
- `createAudioConvertTask(params)` - 创建音频转换任务
- `queryTask(taskId)` - 查询任务状态
- `pollTaskUntilComplete(taskId, queryFn, onProgress)` - 轮询任务直到完成

### `app.js`

小程序入口文件，已移除云开发初始化代码。

## 支持的转换格式

### 文档转换

- PDF → DOCX, TXT, XLSX, PPTX
- DOCX → PDF, HTML, TXT
- XLSX → PDF, DOCX, TXT
- HTML → PDF, DOCX
- TXT → DOCX, XLSX

### 音频转换

- MP3 ↔ WAV, M4A, OGG, FLAC, AAC
- WAV ↔ MP3, M4A, OGG, FLAC, AAC
- 等更多格式...

## 测试

```bash
# 健康检查
curl https://convertease.site/health

# 查询支持的格式
curl https://convertease.site/supported-formats
```

## 更新日志

### 2025-12-10

- ✅ 域名更换为正式域名 `convertease.site`
- ✅ 移除所有云调用相关代码
- ✅ 简化 API 模块，统一使用 HTTP 方式
- ✅ 更新 Postman 测试集合
