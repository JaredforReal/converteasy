/**
 * 格式配置模块
 * 包含文档和音频格式的配置信息
 */

// ==================== 文档格式配置 ====================

/**
 * 文档源格式列表
 */
const DOCUMENT_SOURCE_FORMATS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'html', 'md'];

/**
 * 文档源格式显示名称
 */
const DOCUMENT_SOURCE_FORMAT_DISPLAY = [
  'PDF',
  'Word(.doc)',
  'Word(.docx)',
  'Excel(.xls)',
  'Excel(.xlsx)',
  'PPT(.ppt)',
  'PPT(.pptx)',
  'TXT',
  'RTF',
  'HTML',
  'Markdown'
];

/**
 * 文档目标格式列表
 */
const DOCUMENT_TARGET_FORMATS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'html', 'csv', 'odt', 'ods', 'odp'];

/**
 * 文档格式显示名称映射
 */
const DOCUMENT_FORMAT_DISPLAY_NAMES = {
  'pdf': 'PDF',
  'doc': 'Word(.doc)',
  'docx': 'Word(.docx)',
  'xls': 'Excel(.xls)',
  'xlsx': 'Excel(.xlsx)',
  'ppt': 'PPT(.ppt)',
  'pptx': 'PPT(.pptx)',
  'txt': 'TXT',
  'rtf': 'RTF',
  'html': 'HTML',
  'csv': 'CSV',
  'odt': 'ODT',
  'ods': 'ODS',
  'odp': 'ODP',
  'md': 'Markdown'
};

/**
 * 文档默认转换映射
 */
const DOCUMENT_CONVERSION_MAP = {
  'pdf': ['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'rtf'],
  'doc': ['docx', 'rtf', 'txt', 'odt', 'html', 'pdf'],
  'docx': ['doc', 'rtf', 'txt', 'odt', 'html', 'pdf'],
  'xls': ['xlsx', 'ods', 'csv', 'txt', 'pdf', 'doc'],
  'xlsx': ['xls', 'ods', 'csv', 'txt', 'pdf', 'doc'],
  'ppt': ['pptx', 'odp', 'pdf'],
  'pptx': ['ppt', 'odp', 'pdf'],
  'txt': ['doc', 'docx', 'rtf', 'odt', 'pdf', 'xls', 'xlsx'],
  'rtf': ['doc', 'docx', 'txt', 'odt'],
  'html': ['pdf', 'doc', 'docx'],
  'md': ['html', 'pdf', 'docx']
};

/**
 * 文档格式扩展名映射（带点）
 */
const DOCUMENT_ALLOWED_EXTENSIONS = {
  pdf: ['.pdf'],
  doc: ['.doc'],
  docx: ['.docx'],
  xls: ['.xls'],
  xlsx: ['.xlsx'],
  ppt: ['.ppt'],
  pptx: ['.pptx'],
  txt: ['.txt'],
  rtf: ['.rtf'],
  html: ['.html', '.htm'],
  md: ['.md']
};

/**
 * 文档格式图标映射
 */
const DOCUMENT_ICONS = {
  '.pdf': '📄',
  '.doc': '📝',
  '.docx': '📝',
  '.xls': '📊',
  '.xlsx': '📊',
  '.ppt': '📋',
  '.pptx': '📋',
  '.txt': '📄',
  '.html': '🌐',
  '.rtf': '📄',
  '.csv': '📊',
  '.odt': '📝',
  '.ods': '📊',
  '.odp': '📋',
  '.md': '✍️'
};

// ==================== 音频格式配置 ====================

/**
 * 音频源格式列表
 */
const AUDIO_SOURCE_FORMATS = ['mp3', 'wav', 'aac', 'flac', 'm4a', 'ogg', 'wma'];

/**
 * 音频格式显示名称映射
 */
const AUDIO_FORMAT_DISPLAY_NAMES = {
  'mp3': 'MP3',
  'wav': 'WAV',
  'aac': 'AAC',
  'flac': 'FLAC',
  'm4a': 'M4A',
  'ogg': 'OGG',
  'wma': 'WMA'
};

/**
 * 音频默认转换映射
 */
const AUDIO_CONVERSION_MAP = {
  'mp3': ['wav', 'aac', 'flac', 'm4a', 'ogg', 'wma'],
  'wav': ['mp3', 'aac', 'flac', 'm4a', 'ogg', 'wma'],
  'aac': ['mp3', 'wav', 'm4a', 'flac'],
  'flac': ['wav', 'mp3', 'aac'],
  'ogg': ['mp3', 'wav', 'flac'],
  'm4a': ['mp3', 'wav', 'aac'],
  'wma': ['mp3', 'wav', 'aac']
};

/**
 * 音频格式扩展名映射（带点）
 */
const AUDIO_ALLOWED_EXTENSIONS = {
  'mp3': ['.mp3'],
  'wav': ['.wav'],
  'aac': ['.aac'],
  'flac': ['.flac'],
  'm4a': ['.m4a'],
  'ogg': ['.ogg'],
  'wma': ['.wma']
};

// ==================== 通用工具函数 ====================

/**
 * 根据源格式获取允许的扩展名
 * @param {string} category - 分类 'document' | 'audio'
 * @param {string} sourceFormat - 源格式
 * @returns {string[]} 扩展名列表
 */
function getAllowedExtensions(category, sourceFormat) {
  if (category === 'document') {
    return DOCUMENT_ALLOWED_EXTENSIONS[sourceFormat] || [];
  } else if (category === 'audio') {
    return AUDIO_ALLOWED_EXTENSIONS[sourceFormat] || [];
  }
  return [];
}

/**
 * 根据扩展名获取文件图标
 * @param {string} ext - 扩展名（带点）
 * @returns {string} 图标 emoji
 */
function getFileIcon(ext) {
  return DOCUMENT_ICONS[ext.toLowerCase()] || '📁';
}

/**
 * 获取格式显示名称
 * @param {string} category - 分类 'document' | 'audio'
 * @param {string} format - 格式名
 * @returns {string} 显示名称
 */
function getFormatDisplayName(category, format) {
  if (category === 'document') {
    return DOCUMENT_FORMAT_DISPLAY_NAMES[format] || format.toUpperCase();
  } else if (category === 'audio') {
    return AUDIO_FORMAT_DISPLAY_NAMES[format] || format.toUpperCase();
  }
  return format.toUpperCase();
}

/**
 * 获取目标格式显示名称列表
 * @param {string} category - 分类 'document' | 'audio'
 * @param {string[]} targets - 目标格式列表
 * @returns {string[]} 显示名称列表
 */
function getTargetDisplayNames(category, targets) {
  return targets.map(format => getFormatDisplayName(category, format));
}

module.exports = {
  // 文档格式
  DOCUMENT_SOURCE_FORMATS,
  DOCUMENT_SOURCE_FORMAT_DISPLAY,
  DOCUMENT_TARGET_FORMATS,
  DOCUMENT_FORMAT_DISPLAY_NAMES,
  DOCUMENT_CONVERSION_MAP,
  DOCUMENT_ALLOWED_EXTENSIONS,
  DOCUMENT_ICONS,

  // 音频格式
  AUDIO_SOURCE_FORMATS,
  AUDIO_FORMAT_DISPLAY_NAMES,
  AUDIO_CONVERSION_MAP,
  AUDIO_ALLOWED_EXTENSIONS,

  // 工具函数
  getAllowedExtensions,
  getFileIcon,
  getFormatDisplayName,
  getTargetDisplayNames
};
