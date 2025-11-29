export const config = {
  port: Number(process.env.PORT || 8080),
  host: process.env.HOST || "0.0.0.0",
  publicDir: process.env.PUBLIC_DIR || "public",
  uploadDir: process.env.UPLOAD_DIR || "uploads",
  maxFileSizeBytes: 100 * 1024 * 1024, // 100MB
  allowedDocExt: [".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".txt", ".rtf", ".html"],
  allowedAudioExt: [".mp3", ".wav", ".aac", ".flac", ".m4a", ".ogg", ".wma"],
  ffmpegPath: process.env.FFMPEG_PATH || "ffmpeg",
  sofficePath: process.env.SOFFICE_PATH || "soffice",
  pythonPath: process.env.PYTHON_PATH || "python",
  // 转换质量设置
  audioQuality: {
    mp3: "-b:a 192k -ac 2",
    wav: "-c:a pcm_s16le -ac 2",
    aac: "-b:a 128k -ac 2", 
    flac: "-c:a flac -compression_level 5",
    ogg: "-c:a libvorbis -qscale:a 5",
    m4a: "-c:a aac -b:a 128k -ac 2"
  },
  // 文档转换选项
  docOptions: {
    pdf: "pdf",
    docx: "docx", 
    xlsx: "xlsx",
    pptx: "pptx",
    txt: "txt",
    html: "html"
  },
  // Python 脚本路径
  pythonScripts: {
    pdfToDoc: process.env.PDF_TO_DOC_SCRIPT || "./src/scripts/pdf_to_doc.py",
    pdfToTxt: process.env.PDF_TO_TXT_SCRIPT || "./src/scripts/pdf_to_txt.py",
    pdfToXls: process.env.PDF_TO_XLS_SCRIPT || "./src/scripts/pdf_to_xls.py",
    docToHtml: process.env.DOC_TO_HTML_SCRIPT || "./src/scripts/doc_to_html.py",
    xlsToDoc: process.env.XLS_TO_DOC_SCRIPT || "./src/scripts/xls_to_doc.py",
    xlsToTxt: process.env.XLS_TO_TXT_SCRIPT || "./src/scripts/xls_to_txt.py",
    txtToWord: process.env.TXT_TO_WORD_SCRIPT || "./src/scripts/txt_to_word.py",
    txtToXls: process.env.TXT_TO_XLS_SCRIPT || "./src/scripts/txt_to_xls.py",
    pdfToPpt: process.env.PDF_TO_PPT_SCRIPT || "./src/scripts/pdf_to_ppt.py",
    pdfToExcel: process.env.PDF_TO_EXCEL_SCRIPT || "./src/scripts/pdf_to_excel.py",
    htmlToWord: process.env.HTML_TO_WORD_SCRIPT || "./src/scripts/html_to_word.py",
    htmlToPdf: process.env.HTML_TO_PDF_SCRIPT || "./src/scripts/html_to_pdf.py",
    wordToHtml: process.env.WORD_TO_HTML_SCRIPT || "./src/scripts/doc_to_html.py",
  },
  // 对外可访问的基础 URL
  publicBaseUrl: process.env.PUBLIC_BASE_URL || "http://localhost:8080",
  // 性能优化配置
  conversion: {
    maxConcurrent: 2,
    timeout: 120000,
    cleanupInterval: 3600000,
    fileExpireTime: 24 * 60 * 60 * 1000
  }
};