import path from "node:path";
import fs from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import https from "node:https";
import http from "node:http";
import { pipeline as pipelineCb } from "node:stream";
const pipeline = promisify(pipelineCb);
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { RateLimiterMemory, IRateLimiterRes } from "rate-limiter-flexible";
import multer from "multer";
import { nanoid } from "nanoid";
import { config } from "./config.js";
import { Category, ConvertTask } from "./types.js";
import { 
  ensureDirSync, 
  detectExtByName, 
  isAllowedExt, 
  runFFmpeg, 
  runSoffice, 
  formatFileSize,
  isConversionSupported,
  getSupportedTargets,
  supportedConversions,
  runDocumentConversion,
  findActualOutputFile,
  checkPythonEnvironment,
  checkPythonDependencies
} from "./utils.js";
import pLimit from "p-limit";

const app = express();

// 安全中间件 - 开发环境优化配置
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// CORS 配置 - 允许所有来源访问
app.use(cors({ 
  origin: "*", 
  credentials: false 
}));
app.use(express.json());

// 内存限流器 - 修复配置
const rateLimiter = new RateLimiterMemory({
  points: 120,
  duration: 60,
  blockDuration: 0,
});

// 应用限流中间件
app.use(async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const key = req.ip || "anonymous";
    await rateLimiter.consume(key);
    next();
  } catch (rejRes: unknown) {
    const errorResponse = rejRes as IRateLimiterRes;
    res.status(429).json({
      message: "请求过于频繁，请稍后再试",
      retryAfter: Math.ceil((errorResponse?.msBeforeNext || 1000) / 1000)
    });
  }
});

// 准备目录
const root = process.cwd();
const uploadDir = path.join(root, config.uploadDir);
const publicDir = path.join(root, config.publicDir);
ensureDirSync(uploadDir);
ensureDirSync(publicDir);

// 静态文件服务，用于提供转换结果
app.use("/public", express.static(publicDir, {
  fallthrough: false,
  setHeaders: (res: express.Response, filePath: string) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Cache-Control", "public, max-age=3600");
  }
}));

// Multer 配置
const storage = multer.diskStorage({
  destination: (_req: express.Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => 
    cb(null, uploadDir),
  filename: (req: express.Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const id = nanoid();
    const ext = path.extname(file.originalname).toLowerCase();
    (req as any).originalFileName = path.basename(file.originalname, ext);
    (req as any).originalFileExt = ext;
    (req as any).originalFullName = file.originalname;
    cb(null, `${id}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.maxFileSizeBytes },
  fileFilter: (req: express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const category = String(req.body.category || "");
    const ext = path.extname(file.originalname).toLowerCase();
    if ((category === "document" || category === "audio") && isAllowedExt(category as Category, ext)) {
      cb(null, true);
    } else {
      cb(new Error("文件类型不被允许"));
    }
  },
});

// 内存中的任务存储
const tasks = new Map<string, ConvertTask>();
const convertLimiter = pLimit(config.conversion.maxConcurrent);

// 获取支持格式的接口
app.get("/supported-formats", (req: express.Request, res: express.Response) => {
  const category = req.query.category as Category;
  
  if (category && !["document", "audio"].includes(category)) {
    return res.status(400).json({ message: "不支持的分类" });
  }

  const response: any = {};
  
  if (!category || category === "document") {
    response.document = {
      allowedExtensions: config.allowedDocExt,
      supportedConversions: supportedConversions.document
    };
  }
  
  if (!category || category === "audio") {
    response.audio = {
      allowedExtensions: config.allowedAudioExt,
      supportedConversions: supportedConversions.audio
    };
  }

  res.json(response);
});

// 检测文件支持的转换目标
app.post("/detect-targets", upload.single("file"), (req: express.Request, res: express.Response) => {
  try {
    if (!req.file) return res.status(400).json({ message: "缺少文件" });
    
    const category = String(req.body.category || "") as Category;
    if (!category) return res.status(400).json({ message: "缺少分类参数" });

    const sourceExt = detectExtByName(req.file.originalname);
    const supportedTargets = getSupportedTargets(category, sourceExt);
    
    // 清理上传的文件（只是用于检测）
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
      console.log(`已清理检测用临时文件: ${req.file.path}`);
    }

    res.json({
      filename: req.file.originalname,
      category,
      sourceExtension: sourceExt,
      supportedTargets,
      canConvert: supportedTargets.length > 0
    });
  } catch (error) {
    console.error("检测目标格式错误:", error);
    res.status(500).json({ message: "检测失败" });
  }
});

// 文件上传和转换接口 - 添加格式验证
app.post("/convert/upload", upload.single("file"), async (req: express.Request, res: express.Response) => {
  try {
    const category = String(req.body.category || "") as Category;
    let target = String(req.body.target || "").toLowerCase();
    const sourceFormatFromFrontend = String(req.body.source || "").toLowerCase(); // 前端传递的源格式
    
    // 修复：移除目标格式中的点（如果存在）
    if (target.startsWith('.')) {
      target = target.substring(1);
    }
    
    // If client sent a downloadUrl (from cloud temp file URL), fetch it server-side into uploads dir
    if (!req.file) {
      const downloadUrl = String(req.body.downloadUrl || "");
      if (downloadUrl) {
        // download into uploads
        const ext = path.extname(downloadUrl.split('?')[0] || "") || "";
        const tmpName = `${nanoid()}${ext}`;
        const dest = path.join(uploadDir, tmpName);
        console.log(`Downloading remote file to ${dest} from ${downloadUrl}`);
        try {
          await new Promise<void>((resolve, reject) => {
            const getter = downloadUrl.startsWith('https') ? https.get : http.get;
            const reqGet = getter(downloadUrl, (resp) => {
              if (!resp || (resp.statusCode && resp.statusCode >= 400)) {
                return reject(new Error(`download failed, status ${resp && resp.statusCode}`));
              }
              const ws = fs.createWriteStream(dest);
              resp.pipe(ws);
              ws.on('finish', () => resolve());
              ws.on('error', (err) => reject(err));
            });
            reqGet.on('error', (err) => reject(err));
          });
          // attach a fake file object so the rest of the handler can proceed
          (req as any).file = { path: dest, originalname: path.basename(downloadUrl.split('?')[0] || tmpName) };
          // preserve original file name if provided by client
          if (req.body.cloudPath) {
            (req as any).originalFileName = path.parse(String(req.body.cloudPath)).name;
          }
        } catch (err) {
          console.error('下载远程文件失败:', err);
          return res.status(500).json({ message: '下载远程文件失败' });
        }
      } else {
        return res.status(400).json({ message: "缺少文件" });
      }
    }
    if (!category || !target) return res.status(400).json({ message: "缺少必要字段" });

  const uploadedFile = (req as any).file;
  const inputPath = uploadedFile.path;
  const actualFileExt = detectExtByName(uploadedFile.originalname);
    const actualSourceFormat = actualFileExt.replace(".", "");
    
    // 验证前端选择的格式与实际文件格式是否匹配
    if (sourceFormatFromFrontend && sourceFormatFromFrontend !== actualSourceFormat) {
      if (fs.existsSync(inputPath)) {
        fs.unlinkSync(inputPath);
        console.log(`已清理格式不匹配的文件: ${inputPath}`);
      }
      return res.status(400).json({ 
        message: `文件格式不匹配：选择的是 ${sourceFormatFromFrontend.toUpperCase()} 格式，但上传的是 ${actualSourceFormat.toUpperCase()} 文件` 
      });
    }
    
    // 获取原始文件名
    let originalFileName = (req as any).originalFileName;
    if (!originalFileName) {
      originalFileName = path.parse(uploadedFile.originalname).name;
    }
    
    console.log(`原始文件名解析: 上传文件名="${uploadedFile.originalname}", 提取的原始文件名="${originalFileName}"`);
    console.log(`转换验证: 源扩展名=${actualFileExt}, 目标格式=${target}, 前端选择的源格式=${sourceFormatFromFrontend}`);

    // 记录请求来源
    const userAgent = req.headers['user-agent'] || 'unknown';
    const isMobile = /Mobile|Android|iPhone|iPad/.test(userAgent);
  console.log(`收到转换请求: ${uploadedFile.originalname}, 来源: ${isMobile ? '移动端' : '电脑端'}`);

    // 验证转换是否支持
    if (!isConversionSupported(category, actualFileExt, target)) {
      // 删除已上传的文件
      if (fs.existsSync(inputPath)) {
        fs.unlinkSync(inputPath);
        console.log(`已清理不支持转换的文件: ${inputPath}`);
      }
      const supportedTargets = getSupportedTargets(category, actualFileExt);
      return res.status(400).json({ 
        message: `不支持从 ${actualFileExt} 转换为 ${target}`,
        supportedTargets 
      });
    }

    const id = nanoid();
    const task: ConvertTask = {
      id,
      state: "queued",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      category,
      target,
      source: actualSourceFormat,
      inputPath,
      originalFileName,
    };
    tasks.set(id, task);

  console.log(`任务创建: ${id}, 文件: ${uploadedFile.originalname}, 实际格式: ${actualSourceFormat}, 目标格式: ${target}`);

    // 异步执行转换（并发限制）
    convertLimiter(() => convertAsync(task)).catch((err: Error) => {
      console.error(`任务 ${id} 失败:`, err);
      const t = tasks.get(id);
      if (t) {
        t.state = "error";
        t.error = err?.message || String(err);
        t.updatedAt = Date.now();
        tasks.set(id, t);
      }
    });

    res.json({ 
      taskId: id,
      message: "任务已提交，正在处理中"
    });
  } catch (e: unknown) {
    console.error("上传错误:", e);
    const errorMessage = e instanceof Error ? e.message : "服务器错误";
    res.status(500).json({ message: errorMessage });
  }
});

// 查询任务状态接口
app.get("/convert/task/:id", (req: express.Request, res: express.Response) => {
  const id = req.params.id;
  const task = tasks.get(id);
  if (!task) return res.status(404).json({ message: "任务不存在" });
  
  const { state, url, downloadUrl, previewUrl, error } = task;
  
  console.log(`查询任务状态: ${id}, 状态: ${state}, URL: ${url}`);
  
  res.json({ 
    state, 
    url, 
    downloadUrl, 
    previewUrl,
    message: error 
  });
});

// 异步转换函数
async function convertAsync(task: ConvertTask): Promise<void> {
  task.state = "processing";
  task.updatedAt = Date.now();
  tasks.set(task.id, task);

  const targetExt = `.${task.target}`;
  
  // 生成友好文件名
  const now = new Date();
  const year = now.getFullYear().toString().slice(2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  
  const timestamp = `${year}${month}${day}${hours}${minutes}`;
  
  let originalName = task.originalFileName;
  if (!originalName || originalName.length < 2) {
    originalName = `document_${task.id.slice(0, 6)}`;
  }
  
  const cleanName = originalName.replace(/[^\w\u4e00-\u9fa5\s]/g, '_').replace(/\s+/g, '_');
  const friendlyName = `${cleanName}_${timestamp}`;
  
  console.log(`生成友好文件名: 原始="${originalName}", 清理后="${cleanName}", 时间戳=${timestamp}, 最终="${friendlyName}"`);
  
  try {
    if (task.category === "audio") {
      // 音频文件转换使用 FFmpeg
      const outputPath = path.join(publicDir, `${friendlyName}.${task.target}`);
      console.log(`开始音频转换: ${task.inputPath} -> ${outputPath}`);
      await runFFmpeg(task.inputPath, outputPath, task.target);
      task.outputPath = outputPath;
      task.url = buildPublicUrl(`/public/${path.basename(outputPath)}`);

      const outputFilename = path.basename(outputPath);
      task.downloadUrl = buildDownloadUrl(outputFilename);
      task.previewUrl = buildPreviewUrl(outputFilename);
    } else if (task.category === "document") {
      // 文档转换 - 使用统一的转换函数
      const outputPath = path.join(publicDir, `${friendlyName}.${task.target}`);
      const sourceExt = detectExtByName(task.inputPath);
      
      console.log(`开始文档转换: ${task.inputPath} -> ${outputPath}`);
      console.log(`转换类型: ${sourceExt} -> ${targetExt}`);
      
      // 保险逻辑：runDocumentConversion 可通过 arguments[4].actualOutputPath 传递实际生成的文件路径
      const outputInfo: { actualOutputPath?: string } = {};
      await runDocumentConversion(task.inputPath, outputPath, sourceExt, task.target, outputInfo);

      let finalOutputPath = outputPath;
      if (outputInfo.actualOutputPath && outputInfo.actualOutputPath !== outputPath) {
        // 如果保险逻辑生效，使用实际生成的文件名
        finalOutputPath = outputInfo.actualOutputPath;
        console.warn(`保险逻辑生效，任务输出文件采用实际生成名: ${finalOutputPath}`);
      }
      task.outputPath = finalOutputPath;
      task.url = buildPublicUrl(`/public/${path.basename(finalOutputPath)}`);

      const outputFilename = path.basename(finalOutputPath);
      task.downloadUrl = buildDownloadUrl(outputFilename);
      task.previewUrl = buildPreviewUrl(outputFilename);
    } else {
      throw new Error("不支持的分类");
    }

    task.state = "finished";
    task.updatedAt = Date.now();
    tasks.set(task.id, task);
    
    console.log(`任务 ${task.id} 完成: ${task.url}, 文件大小: ${formatFileSize(fs.statSync(task.outputPath!).size)}`);
    
    // 转换成功后立即清理输入文件
    if (fs.existsSync(task.inputPath)) {
      try {
        fs.unlinkSync(task.inputPath);
        console.log(`已清理输入文件: ${task.inputPath}`);
      } catch (error) {
        console.error(`清理输入文件失败: ${task.inputPath}`, error);
      }
    }
    
  } catch (error) {
    task.state = "error";
    task.error = error instanceof Error ? error.message : String(error);
    task.updatedAt = Date.now();
    tasks.set(task.id, task);
    console.error(`任务 ${task.id} 转换失败:`, error);
    
    // 转换失败时也清理输入文件
    if (fs.existsSync(task.inputPath)) {
      try {
        fs.unlinkSync(task.inputPath);
        console.log(`转换失败，已清理输入文件: ${task.inputPath}`);
      } catch (deleteError) {
        console.error(`清理失败输入文件失败: ${task.inputPath}`, deleteError);
      }
    }
    
    throw error;
  }
}

// 清理过期文件的任务
function cleanupExpiredFiles(): void {
  const now = Date.now();
  const expireTime = config.conversion.fileExpireTime;
  
  console.log(`开始清理过期文件，当前时间: ${new Date(now).toISOString()}`);
  
  // 清理过期的任务和相关文件
  for (const [id, task] of tasks.entries()) {
    if (now - task.createdAt > expireTime) {
      // 删除输入文件
      if (task.inputPath && fs.existsSync(task.inputPath)) {
        try {
          fs.unlinkSync(task.inputPath);
          console.log(`已清理过期输入文件: ${task.inputPath}`);
        } catch (error) {
          console.error(`清理输入文件失败: ${task.inputPath}`, error);
        }
      }
      // 删除输出文件
      if (task.outputPath && fs.existsSync(task.outputPath)) {
        try {
          fs.unlinkSync(task.outputPath);
          console.log(`已清理过期输出文件: ${task.outputPath}`);
        } catch (error) {
          console.error(`清理输出文件失败: ${task.outputPath}`, error);
        }
      }
      tasks.delete(id);
      console.log(`已清理过期任务: ${id}`);
    }
  }
  
  // 清理 uploads 目录中的孤立文件（超过1小时）
  cleanupOrphanedFiles(uploadDir, 60 * 60 * 1000, "uploads");
  
  // 清理 public 目录中的孤立文件（超过24小时）
  cleanupOrphanedFiles(publicDir, 24 * 60 * 60 * 1000, "public");
}

// 清理孤立文件
function cleanupOrphanedFiles(directory: string, maxAge: number, dirName: string): void {
  try {
    const files = fs.readdirSync(directory);
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const file of files) {
      const filePath = path.join(directory, file);
      try {
        const stats = fs.statSync(filePath);
        // 跳过目录，只处理文件
        if (stats.isDirectory()) continue;
        
        // 检查文件是否超过指定时间未被修改
        if (now - stats.mtimeMs > maxAge) {
          // 跳过友好命名的文件（包含时间戳的文件）
          if (file.match(/_\d{8,10}\./)) {
            console.log(`跳过友好命名文件: ${filePath}`);
            continue;
          }
          
          fs.unlinkSync(filePath);
          console.log(`已清理孤立文件 (${dirName}): ${filePath}`);
          cleanedCount++;
        }
      } catch (error) {
        console.error(`检查文件失败: ${filePath}`, error);
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`在 ${dirName} 目录中清理了 ${cleanedCount} 个孤立文件`);
    }
  } catch (error) {
    console.error(`清理 ${dirName} 目录失败:`, error);
  }
}

// 立即清理所有过期文件（启动时执行一次）
function cleanupAllExpiredFiles(): void {
  console.log("启动时执行全局文件清理...");
  cleanupExpiredFiles();
}

// 设置定时清理任务
setInterval(() => {
  cleanupExpiredFiles();
}, config.conversion.cleanupInterval);

// 健康检查接口
app.get("/health", (_req: express.Request, res: express.Response) => res.json({ 
  ok: true,
  timestamp: new Date().toISOString(),
  service: "file-convert-backend",
  version: "1.0.0"
}));

// 手动清理接口（用于调试）
app.post("/cleanup", (_req: express.Request, res: express.Response) => {
  try {
    cleanupExpiredFiles();
    res.json({ 
      message: "清理完成",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("手动清理失败:", error);
    res.status(500).json({ 
      message: "清理失败",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// 服务器状态接口
app.get("/server-status", (_req: express.Request, res: express.Response) => {
  const os = require('node:os');
  
  // 获取目录文件统计
  let uploadsFileCount = 0;
  let publicFileCount = 0;
  try {
    uploadsFileCount = fs.readdirSync(uploadDir).length;
    publicFileCount = fs.readdirSync(publicDir).length;
  } catch (error) {
    console.error("获取目录文件统计失败:", error);
  }
  
  res.json({
    status: "running",
    timestamp: new Date().toISOString(),
    server: {
      host: config.host,
      port: config.port,
      publicBaseUrl: config.publicBaseUrl
    },
    tasks: {
      total: tasks.size,
      queued: Array.from(tasks.values()).filter(t => t.state === 'queued').length,
      processing: Array.from(tasks.values()).filter(t => t.state === 'processing').length,
      finished: Array.from(tasks.values()).filter(t => t.state === 'finished').length,
      error: Array.from(tasks.values()).filter(t => t.state === 'error').length
    },
    files: {
      uploads: uploadsFileCount,
      public: publicFileCount
    },
    system: {
      platform: os.platform(),
      arch: os.arch(),
      uptime: os.uptime(),
      loadavg: os.loadavg(),
      freemem: formatFileSize(os.freemem()),
      totalmem: formatFileSize(os.totalmem())
    }
  });
});

// 全局错误处理中间件
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("服务器错误:", err);
  const errorMessage = err instanceof Error ? err.message : "服务器错误";
  res.status(500).json({ 
    message: errorMessage,
    timestamp: new Date().toISOString()
  });
});

// 服务预热函数
const warmUpServices = async (): Promise<void> => {
  try {
    console.log("正在检查转换服务可用性...");
    
    const execAsync = promisify(exec);
    
    // 检查 LibreOffice
    try {
      const { stdout } = await execAsync('soffice --version');
      console.log('✓ LibreOffice 可用:', stdout?.toString().split('\n')[0]);
    } catch (error) {
      console.log('⚠ LibreOffice 检查失败:', error instanceof Error ? error.message : '未知错误');
    }
    
    // 检查 FFmpeg
    try {
      const { stdout } = await execAsync('ffmpeg -version');
      const versionLine = stdout?.toString().split('\n')[0];
      console.log('✓ FFmpeg 可用:', versionLine);
    } catch (error) {
      console.log('⚠ FFmpeg 检查失败:', error instanceof Error ? error.message : '未知错误');
    }
    
    // 检查 Python 环境
    const pythonAvailable = await checkPythonEnvironment();
    if (pythonAvailable) {
      await checkPythonDependencies();
    } else {
      console.log('⚠ Python 环境不可用，部分转换功能将受限');
    }
    
    console.log("转换服务检查完成");
  } catch (error) {
    console.warn("服务预热检查警告:", error);
  }
};

// 启动服务器
app.listen(config.port, config.host, () => {
  console.log(`服务器运行在 http://${config.host}:${config.port}`);
  console.log(`公网访问地址: ${config.publicBaseUrl}`);
  console.log(`文件上传大小限制: ${formatFileSize(config.maxFileSizeBytes)}`);
  console.log(`支持的文档格式: ${config.allowedDocExt.join(", ")}`);
  console.log(`支持的音频格式: ${config.allowedAudioExt.join(", ")}`);
  console.log(`并发转换任务数: ${config.conversion.maxConcurrent}`);
  console.log(`文件清理间隔: ${config.conversion.cleanupInterval / 1000 / 60} 分钟`);
  console.log(`文件过期时间: ${config.conversion.fileExpireTime / 1000 / 60 / 60} 小时`);
  
  // 启动时执行一次全局清理
  cleanupAllExpiredFiles();
  
  // 异步预热服务，不阻塞服务器启动
  warmUpServices().catch((error) => {
    console.error("服务预热失败:", error);
  });
});

function buildPublicUrl(pathname: string): string {
  const base = (config.publicBaseUrl && config.publicBaseUrl.replace(/\/$/, "")) || `http://localhost:${config.port}`;
  return `${base}${pathname}`;
}

// 下载 URL
function buildDownloadUrl(filename: string): string {
  return buildPublicUrl(`/download/${filename}`);
}

// 预览 URL  
function buildPreviewUrl(filename: string): string {
  return buildPublicUrl(`/preview/${filename}`);
}

// 文件下载接口
app.get("/download/:filename", (req: express.Request, res: express.Response) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(publicDir, filename);
    
    // 安全检查：防止路径遍历攻击
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(path.resolve(publicDir))) {
      return res.status(403).json({ message: "访问被拒绝" });
    }
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "文件不存在" });
    }
    
    // 设置下载 headers
    const stat = fs.statSync(filePath);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename=${encodeURIComponent(filename)}`);
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Cache-Control", "public, max-age=3600");
    
    // 发送文件
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
  } catch (error) {
    console.error("文件下载错误:", error);
    res.status(500).json({ message: "下载失败" });
  }
});

// 文件预览接口（直接返回文件，不强制下载）
app.get("/preview/:filename", (req: express.Request, res: express.Response) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(publicDir, filename);
    
    // 安全检查
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(path.resolve(publicDir))) {
      return res.status(403).json({ message: "访问被拒绝" });
    }
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "文件不存在" });
    }
    
    // 根据文件类型设置 Content-Type
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.aac': 'audio/aac',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.txt': 'text/plain',
    };
    
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.setHeader("Content-Type", contentType);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Cache-Control", "public, max-age=3600");
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
  } catch (error) {
    console.error("文件预览错误:", error);
    res.status(500).json({ message: "预览失败" });
  }
});