import path from "node:path";
import fs from "node:fs";
import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config.js";
import { Category } from "./types.js";

const exec = promisify(execCb);

// 转换支持映射
export const supportedConversions: Record<Category, Record<string, string[]>> = {
  document: {
    // PDF 转换：使用 Python 脚本实现 PDF 转其他格式
    pdf: [".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".txt", ".rtf"],
    // Word 转换（合并到单个定义中）
    doc: [".docx", ".rtf", ".txt", ".odt", ".html", ".pdf"],      // 包含 PDF 转 Word
    docx: [".doc", ".rtf", ".txt", ".odt", ".html", ".pdf"],     // 包含 PDF 转 Word
    // Excel 转换（合并到单个定义中）  
    xlsx: [".xls", ".ods", ".csv", ".txt", ".pdf", ".doc"],
    xls: [".xlsx", ".ods", ".csv", ".txt", ".pdf", ".doc"],
    // PowerPoint 转换（合并到单个定义中）
    pptx: [".ppt", ".odp", ".pdf"],
    ppt: [".pptx", ".odp", ".pdf"],
    // 文本格式转换（合并到单个定义中）
    txt: [".doc", ".docx", ".rtf", ".odt", ".pdf", ".xls", ".xlsx"],
    rtf: [".doc", ".docx", ".txt", ".odt"],
    html: [".pdf", ".doc", ".docx"] // PDF/Doc 转 HTML
  },
  audio: {
    mp3: [".mp3", ".wav", ".aac", ".flac", ".m4a", ".ogg", ".wma"],
    wav: [".wav", ".mp3", ".aac", ".flac", ".m4a", ".ogg", ".wma"],
    aac: [".aac", ".mp3", ".wav", ".m4a", ".flac"],
    flac: [".flac", ".wav", ".mp3", ".aac"],
    ogg: [".ogg", ".mp3", ".wav", ".flac"],
    m4a: [".m4a", ".mp3", ".wav", ".aac"]
  }
};

// 需要 Python 脚本的转换组合
export const pythonConversions: Record<string, { script: string, description: string }> = {
  "pdf->doc": { script: config.pythonScripts.pdfToDoc, description: "PDF 转 Word" },
  "pdf->docx": { script: config.pythonScripts.pdfToDoc, description: "PDF 转 Word" },
  "pdf->txt": { script: config.pythonScripts.pdfToTxt, description: "PDF 转文本" },
  "pdf->xls": { script: config.pythonScripts.pdfToXls, description: "PDF 转 Excel" },
  "pdf->xlsx": { script: config.pythonScripts.pdfToXls, description: "PDF 转 Excel" },
  "pdf->ppt": { script: config.pythonScripts.pdfToPpt, description: "PDF 转 PowerPoint" },
  "pdf->pptx": { script: config.pythonScripts.pdfToPpt, description: "PDF 转 PowerPoint" },
  "doc->html": { script: config.pythonScripts.docToHtml, description: "Word 转 HTML" },
  "docx->html": { script: config.pythonScripts.docToHtml, description: "Word 转 HTML" },
  "xls->doc": { script: config.pythonScripts.xlsToDoc, description: "Excel 转 Word" },
  "xlsx->doc": { script: config.pythonScripts.xlsToDoc, description: "Excel 转 Word" },
  "xls->docx": { script: config.pythonScripts.xlsToDoc, description: "Excel 转 Word" },
  "xlsx->docx": { script: config.pythonScripts.xlsToDoc, description: "Excel 转 Word" },
  "xls->txt": { script: config.pythonScripts.xlsToTxt, description: "Excel 转文本" },
  "xlsx->txt": { script: config.pythonScripts.xlsToTxt, description: "Excel 转文本" },
  "txt->doc": { script: config.pythonScripts.txtToWord, description: "文本转 Word" },
  "txt->docx": { script: config.pythonScripts.txtToWord, description: "文本转 Word" },
  "txt->xls": { script: config.pythonScripts.txtToXls, description: "文本转 Excel" },
  "txt->xlsx": { script: config.pythonScripts.txtToXls, description: "文本转 Excel" },
  "html->doc": { script: config.pythonScripts.htmlToWord, description: "HTML 转 Word" },
  "html->docx": { script: config.pythonScripts.htmlToWord, description: "HTML 转 Word" },
  "html->pdf": { script: config.pythonScripts.htmlToPdf, description: "HTML 转 PDF" },
};

// 验证转换是否支持
export function isConversionSupported(category: Category, sourceExt: string, targetFormat: string): boolean {
  if (category !== "document") {
    const conversions = supportedConversions[category];
    return !!(conversions && conversions[targetFormat] && conversions[targetFormat].includes(sourceExt));
  }

  const conversions = supportedConversions.document;
  if (!conversions || !conversions[targetFormat]) {
    return false;
  }
  
  // 检查是否支持该转换组合
  const sourceFormat = sourceExt.replace(".", "");
  const conversionKey = `${sourceFormat}->${targetFormat}`;
  
  // 如果这个转换需要 Python 脚本，检查脚本是否存在
  if (pythonConversions[conversionKey]) {
    const scriptPath = pythonConversions[conversionKey].script;
    console.log(`检查 Python 脚本路径: ${scriptPath}`);
    console.log(`文件是否存在: ${fs.existsSync(scriptPath)}`);
    
    if (!fs.existsSync(scriptPath)) {
      console.warn(`Python 脚本不存在: ${scriptPath}`);
      console.log(`当前工作目录: ${process.cwd()}`);
      return false;
    }
    return true;
  }
  
  // 常规 LibreOffice 转换
  return conversions[targetFormat].includes(sourceExt);
}

// 获取支持的转换目标格式
export function getSupportedTargets(category: Category, sourceExt: string): string[] {
  if (category !== "document") {
    const conversions = supportedConversions[category];
    const supported: string[] = [];
    
    for (const [target, sources] of Object.entries(conversions)) {
      if (sources.includes(sourceExt)) {
        supported.push(target);
      }
    }
    
    return supported;
  }

  const conversions = supportedConversions.document;
  const supported: string[] = [];
  const sourceFormat = sourceExt.replace(".", "");
  
  for (const [target, sources] of Object.entries(conversions)) {
    const conversionKey = `${sourceFormat}->${target}`;
    
    // 如果是 Python 转换，检查脚本是否存在
    if (pythonConversions[conversionKey]) {
      const scriptPath = pythonConversions[conversionKey].script;
      if (fs.existsSync(scriptPath)) {
        supported.push(target);
      }
    } 
    // 常规 LibreOffice 转换
    else if (sources.includes(sourceExt)) {
      supported.push(target);
    }
  }
  
  return supported;
}

// 改进的 LibreOffice 路径检测
function findSofficePath(): string {
  const isWindows = process.platform === 'win32';
  
  const commonPaths = [
    "/usr/bin/soffice",
    "/usr/local/bin/soffice", 
    "/snap/bin/soffice",
    "/opt/libreoffice/program/soffice",
    "soffice",
  ];

  // Windows 系统路径
  if (isWindows) {
    const windowsPaths = [
      "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
      "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
      "D:\\Program Files\\LibreOffice\\program\\soffice.exe",
      "soffice.exe",
      "soffice",
    ];
    commonPaths.unshift(...windowsPaths);
  }

  for (const testPath of commonPaths) {
    try {
      if (fs.existsSync(testPath)) {
        console.log(`Found LibreOffice at: ${testPath}`);
        return testPath;
      }
    } catch {
      // 忽略文件系统错误
    }
  }
  
  console.warn("LibreOffice not found in common paths, using default:", config.sofficePath);
  return config.sofficePath;
}

export function ensureDirSync(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function detectExtByName(filename: string): string {
  return path.extname(filename || "").toLowerCase();
}

export function isAllowedExt(category: Category, ext: string): boolean {
  if (category === "document") return config.allowedDocExt.includes(ext);
  if (category === "audio") return config.allowedAudioExt.includes(ext);
  return false;
}

// 优化的 FFmpeg 参数
function getOptimizedFFmpegParams(targetFormat: string): string {
  const baseParams = "-hide_banner -loglevel error -stats -y";
  
  switch (targetFormat) {
    case "mp3":
      return `${baseParams} -c:a libmp3lame -threads 0 -af "volume=1.0"`;
    case "wav":
      return `${baseParams} -c:a pcm_s16le -ac 2`;
    case "aac":
      return `${baseParams} -c:a aac -threads 0 -movflags +faststart`;
    case "flac":
      return `${baseParams} -compression_level 8`;
    case "ogg":
      return `${baseParams} -c:a libvorbis -qscale:a 5`;
    case "m4a":
      return `${baseParams} -c:a aac -b:a 128k -movflags +faststart`;
    default:
      return baseParams;
  }
}

// 改进的音频转换函数
export async function runFFmpeg(input: string, output: string, targetFormat: string) {
  const quality = config.audioQuality[targetFormat as keyof typeof config.audioQuality] || "";
  
  const optimizedParams = getOptimizedFFmpegParams(targetFormat);
  
  const ffmpegBin = wrapPath(config.ffmpegPath);
  const cmd = `${ffmpegBin} -i ${wrapPath(input)} ${optimizedParams} ${quality} ${wrapPath(output)}`;
  console.log(`Running FFmpeg: ${cmd}`);
  
  try {
    const { stdout, stderr } = await exec(cmd, { timeout: config.conversion.timeout });
    if (stdout) console.log(`FFmpeg output: ${stdout}`);
    if (stderr) console.warn(`FFmpeg warnings: ${stderr}`);
    
    // 验证输出文件
    if (!fs.existsSync(output)) {
      throw new Error("FFmpeg 转换失败，输出文件未生成");
    }
    
    const stats = fs.statSync(output);
    if (stats.size === 0) {
      fs.unlinkSync(output);
      throw new Error("FFmpeg 转换失败，输出文件为空");
    }
    
  } catch (error) {
    if (fs.existsSync(output)) {
      fs.unlinkSync(output);
    }
    throw error;
  }
}

// 改进的文档转换函数 - 支持 Python 脚本
export async function runDocumentConversion(input: string, output: string, sourceExt: string, targetFormat: string, outputInfo?: { actualOutputPath?: string }): Promise<void> {
  const sourceFormat = sourceExt.replace(".", "");
  const conversionKey = `${sourceFormat}->${targetFormat}`;
  
  console.log(`开始文档转换: ${input} -> ${output}`);
  console.log(`转换类型: ${sourceFormat} -> ${targetFormat}`);
  console.log(`转换键: ${conversionKey}`);
  
  // 检查是否需要使用 Python 脚本
  if (pythonConversions[conversionKey]) {
    console.log(`使用 Python 脚本转换: ${pythonConversions[conversionKey].description}`);
    await runPythonConversion(input, output, conversionKey);
  } else {
    console.log(`使用 LibreOffice 转换`);
    // 使用 LibreOffice 进行常规转换
    await runSoffice(path.dirname(input), path.dirname(output), `.${targetFormat}`, path.basename(input));
    
    // 检查 LibreOffice 输出并重命名
    const actualOutput = await findActualOutputFile(path.dirname(output), path.parse(input).name, `.${targetFormat}`);
    if (actualOutput && actualOutput !== path.basename(output)) {
      const actualOutputPath = path.join(path.dirname(output), actualOutput);
      if (fs.existsSync(actualOutputPath)) {
        let renameSuccess = false;
        try {
          fs.renameSync(actualOutputPath, output);
          renameSuccess = true;
        } catch (renameErr) {
          console.warn(`重命名输出文件失败，尝试回退为拷贝: ${actualOutputPath} -> ${output}`, renameErr);
          try {
            fs.copyFileSync(actualOutputPath, output);
            fs.unlinkSync(actualOutputPath);
            console.log(`已通过拷贝方式生成输出文件: ${output}`);
            renameSuccess = true;
          } catch (copyErr) {
            console.error(`回退拷贝失败: ${actualOutputPath} -> ${output}`, copyErr);
            // 保险：如果友好名无法生成，直接用实际生成的文件名
            if (outputInfo && typeof outputInfo === 'object') {
              outputInfo.actualOutputPath = actualOutputPath;
            }
            console.warn(`保险逻辑：任务输出文件采用实际生成名: ${actualOutputPath}`);
          }
        }
      }
    }
  }
}

// Python 脚本转换函数
export async function runPythonConversion(input: string, output: string, conversionKey: string): Promise<void> {
  const pythonScript = pythonConversions[conversionKey];
  if (!pythonScript || !fs.existsSync(pythonScript.script)) {
    throw new Error(`转换脚本不存在: ${pythonScript?.script}`);
  }
  
  const pythonBin = wrapPath(config.pythonPath);
  const scriptPath = wrapPath(pythonScript.script);
  const inputPath = wrapPath(input);
  const outputPath = wrapPath(output);
  
  // 构建 Python 命令（根据脚本要求调整参数格式）
  const cmd = `${pythonBin} ${scriptPath} -i ${inputPath} -o ${outputPath}`;
  
  console.log(`Running Python conversion: ${cmd}`);
  console.log(`转换类型: ${pythonScript.description}`);
  
  try {
    const { stdout, stderr } = await exec(cmd, { 
      timeout: config.conversion.timeout,
      env: { ...process.env, PYTHONPATH: path.dirname(pythonScript.script) }
    });
    
    if (stdout) console.log(`Python output: ${stdout}`);
    if (stderr) console.warn(`Python warnings: ${stderr}`);
    
    // 验证输出文件
    if (!fs.existsSync(output)) {
      throw new Error("Python 转换失败，输出文件未生成");
    }
    
    const stats = fs.statSync(output);
    if (stats.size === 0) {
      fs.unlinkSync(output);
      throw new Error("Python 转换失败，输出文件为空");
    }
    
    console.log(`Python 转换成功: ${input} -> ${output}`);
    
  } catch (error) {
    console.error(`Python conversion failed:`, error);
    
    // 清理可能生成的不完整文件
    if (fs.existsSync(output)) {
      fs.unlinkSync(output);
    }
    
    let errorMessage = `Python 转换失败: ${pythonScript.description}`;
    if (error instanceof Error) {
      if (error.message.includes("timeout")) {
        errorMessage = "转换超时，请重试";
      } else if (error.message.includes("ModuleNotFoundError")) {
        errorMessage = "缺少必要的 Python 依赖库";
      } else {
        errorMessage += ` - ${error.message}`;
      }
    }
    
    throw new Error(errorMessage);
  }
}

// 改进的 LibreOffice 转换函数
export async function runSoffice(inputDir: string, outputDir: string, targetExt: string, inputFilename?: string) {
  const targetFormat = targetExt.replace(".", "");
  
  const sofficeBin = wrapPath(findSofficePath());
  
  let inputPath: string;
  
  if (inputFilename) {
    inputPath = wrapPath(path.join(inputDir, inputFilename));
  } else {
    const files = fs.readdirSync(inputDir)
      .filter(file => {
        const ext = path.extname(file).toLowerCase();
        return config.allowedDocExt.includes(ext);
      })
      .map(file => wrapPath(path.join(inputDir, file)));
    
    if (files.length === 0) {
      throw new Error("输入目录中没有找到可转换的文件");
    }
    inputPath = files.join(' ');
  }
  
  const cmd = `${sofficeBin} --headless --norestore --nofirststartwizard --nologo --nodefault --view --convert-to ${targetFormat} --outdir ${wrapPath(outputDir)} ${inputPath}`;
  
  console.log(`Running LibreOffice: ${cmd}`);
  
  try {
    const { stdout, stderr } = await exec(cmd, { 
      timeout: config.conversion.timeout,
      env: { ...process.env, HOME: '/tmp' }
    });
    
    if (stdout) console.log(`LibreOffice output: ${stdout}`);
    if (stderr) console.warn(`LibreOffice warnings: ${stderr}`);
    
    const convertedFiles = fs.readdirSync(outputDir)
      .filter(file => path.extname(file).toLowerCase() === targetExt);
    
    if (convertedFiles.length === 0) {
      throw new Error(`LibreOffice 转换失败，未生成 ${targetExt} 文件`);
    }
    
    console.log(`LibreOffice 转换完成，生成文件: ${convertedFiles.join(', ')}`);
    
  } catch (error) {
    console.error(`LibreOffice conversion failed:`, error);
    
    let errorMessage = "文档转换失败";
    if (error instanceof Error) {
      if (error.message.includes("timeout")) {
        errorMessage = "文档转换超时，请重试";
      } else if (error.message.includes("ENOENT")) {
        errorMessage = "LibreOffice 未安装或路径配置错误";
      } else {
        errorMessage = `文档转换失败: ${error.message}`;
      }
    }
    
    throw new Error(errorMessage);
  }
}

// 辅助函数：查找实际输出文件
export async function findActualOutputFile(outputDir: string, originalName: string, targetExt: string): Promise<string | null> {
  const files = fs.readdirSync(outputDir)
    .filter(file => path.extname(file).toLowerCase() === targetExt);
  
  // 优先查找与原始文件名相关的文件
  const relatedFiles = files.filter(file => file.includes(originalName));
  if (relatedFiles.length > 0) {
    return relatedFiles[0];
  }
  
  // 返回最新的文件
  if (files.length > 0) {
    const sortedFiles = files.map(file => {
      const filePath = path.join(outputDir, file);
      const stats = fs.statSync(filePath);
      return { file, mtime: stats.mtime };
    }).sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    
    return sortedFiles[0].file;
  }
  
  return null;
}

export function wrapPath(p: string): string {
  return `"${p}"`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

export function getFileIcon(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const iconMap: Record<string, string> = {
    '.pdf': '📄',
    '.doc': '📝',
    '.docx': '📝',
    '.xls': '📊',
    '.xlsx': '📊',
    '.ppt': '📋',
    '.pptx': '📋',
    '.txt': '📄',
    '.rtf': '📄',
    '.html': '🌐',
    '.mp3': '🎵',
    '.wav': '🎵',
    '.aac': '🎵',
    '.flac': '🎵',
    '.m4a': '🎵',
    '.ogg': '🎵',
    '.wma': '🎵',
  };
  return iconMap[ext] || '📁';
}

// 验证文件是否可转换
export function validateFileForConversion(filePath: string, category: Category): void {
  if (!fs.existsSync(filePath)) {
    throw new Error("文件不存在");
  }
  
  const stats = fs.statSync(filePath);
  if (stats.size === 0) {
    throw new Error("文件为空");
  }
  
  if (stats.size > config.maxFileSizeBytes) {
    throw new Error(`文件大小超过限制: ${formatFileSize(config.maxFileSizeBytes)}`);
  }
  
  if (category === "document") {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".pdf") {
      const buffer = Buffer.alloc(4);
      const fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, buffer, 0, 4, 0);
      fs.closeSync(fd);
      
      if (buffer.toString() !== "%PDF") {
        throw new Error("PDF 文件格式不正确或已损坏");
      }
    }
  }
}

// 检查 Python 环境
export async function checkPythonEnvironment(): Promise<boolean> {
  try {
    const { stdout } = await exec(`${config.pythonPath} --version`);
    console.log(`Python 环境: ${stdout?.toString().trim()}`);
    return true;
  } catch (error) {
    console.warn("Python 环境检查失败:", error);
    return false;
  }
}

// 检查 Python 脚本依赖
export async function checkPythonDependencies(): Promise<void> {
  const requiredPackages = [
    { name: 'pdf2docx', import: 'pdf2docx' },
    { name: 'pdfplumber', import: 'pdfplumber' },
    { name: 'python-docx', import: 'docx' },
    { name: 'openpyxl', import: 'openpyxl' },
    { name: 'pandas', import: 'pandas' },
    { name: 'python-pptx', import: 'pptx' },
    { name: 'beautifulsoup4', import: 'bs4' },
    { name: 'pdfkit', import: 'pdfkit' }
  ];
  
  console.log('检查 Python 依赖...');
  
  for (const pkg of requiredPackages) {
    try {
      await exec(`${config.pythonPath} -c "import ${pkg.import}"`);
      console.log(`✓ Python 依赖 ${pkg.name} 可用 (导入名: ${pkg.import})`);
    } catch (error) {
      console.warn(`⚠ Python 依赖 ${pkg.name} 未安装或导入失败 (尝试导入: ${pkg.import})`);
      console.log(`   请运行: pip install ${pkg.name}`);
    }
  }
}