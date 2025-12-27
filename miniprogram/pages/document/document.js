/**
 * 文档转换页面
 * 重构版本 - 统一交互逻辑
 */

const { formatSize, getExt, showLoading, hideLoading, showToast } = require('../../utils/common');
const { downloadFile: downloadFileUtil, chooseMessageFile } = require('../../utils/file'); // 移除不需要的引用
const {
  normalizeFileUrl,
  createDocumentConvertTask,
  queryTask,
  pollTaskUntilComplete,
  loadSupportedFormats,
  healthCheck
} = require('../../utils/api');
const {
  DOCUMENT_SOURCE_FORMATS,
  DOCUMENT_SOURCE_FORMAT_DISPLAY,
  DOCUMENT_FORMAT_DISPLAY_NAMES,
  DOCUMENT_CONVERSION_MAP,
  DOCUMENT_ALLOWED_EXTENSIONS,
  getFileIcon: getFileIconFromFormat,
  getTargetDisplayNames
} = require('../../utils/formats');

Page({
  data: {
    // 源格式
    sourceFormats: DOCUMENT_SOURCE_FORMATS,
    sourceFormatDisplay: DOCUMENT_SOURCE_FORMAT_DISPLAY,
    sourceIndex: -1,

    // 目标格式
    targetIndex: -1,
    availableTargets: [],
    itemDisplayNames: [],
    targetFormatNames: '',

    // 转换映射
    conversionMap: { ...DOCUMENT_CONVERSION_MAP },

    // 文件列表
    fileList: [],
    converting: false,
    progress: 0,
    progressText: '',

    // 格式显示名称
    formatDisplayNames: DOCUMENT_FORMAT_DISPLAY_NAMES
  },

  onLoad() {
    this.testConnection();
    this.loadFormats();
  },

  // 测试服务连接
  async testConnection() {
    try {
      await healthCheck();
      console.log('✅ 服务连接成功');
    } catch (err) {
      console.error('❌ 服务连接失败:', err);
      // 静默失败，不打扰用户，但在转换时会再次检查
    }
  },

  // 加载服务器支持的格式
  async loadFormats() {
    try {
      const result = await loadSupportedFormats('document');
      if (result?.document?.supportedConversions) {
        const rawMap = result.document.supportedConversions;
        const normalizedMap = {};

        // 规范化：移除扩展名前的点
        Object.keys(rawMap).forEach(key => {
          const targets = rawMap[key];
          if (Array.isArray(targets)) {
            // 确保 key 也没有点
            const normalizedKey = key.replace(/^\./, '');
            normalizedMap[normalizedKey] = targets.map(t => t.replace(/^\./, ''));
          }
        });

        console.log('Loaded conversion map:', normalizedMap);
        this.setData({ conversionMap: normalizedMap });
      }
    } catch (error) {
      console.warn('加载支持的格式失败，使用默认配置', error);
    }
  },

  // 选择源格式
  selectSourceFormat(e) {
    const index = Number(e.currentTarget.dataset.index);
    const sourceFormat = this.data.sourceFormats[index];
    const availableTargets = this.data.conversionMap[sourceFormat] || [];

    console.log('Selected source:', sourceFormat, 'Available targets:', availableTargets);

    const itemDisplayNames = getTargetDisplayNames('document', availableTargets);
    const targetFormatNames = itemDisplayNames.join('、');

    this.setData({
      sourceIndex: index,
      availableTargets,
      itemDisplayNames,
      targetFormatNames,
      targetIndex: availableTargets.length > 0 ? 0 : -1
    });
  },

  // 选择目标格式
  selectTargetFormat(e) {
    const index = Number(e.currentTarget.dataset.index);
    this.setData({ targetIndex: index });
  },

  // ========== 文件选择 (统一逻辑) ==========

  chooseFileAction() {
    if (this.data.sourceIndex === -1) {
      showToast('请先选择源文件格式', 'none');
      return;
    }

    const sourceFormat = this.data.sourceFormats[this.data.sourceIndex];
    const allowedExt = this._getAllowedExtensions(sourceFormat);

    // 【修改点】直接调用微信文件选择，不再弹出 ActionSheet
    // 小程序无法直接访问手机文件管理器（除了媒体文件），
    // 标准做法是引导用户选择"聊天文件"（文件传输助手）。
    this.chooseFile(allowedExt);
  },

  async chooseFile(allowedExt) {
    try {
      const tempFiles = await chooseMessageFile(allowedExt, 9);
      this._processSelectedFiles(tempFiles);
    } catch (err) {
      if (err.errMsg && !err.errMsg.includes('cancel')) {
        showToast('文件选择失败', 'none');
      }
    }
  },

  _processSelectedFiles(tempFiles) {
    const newFiles = [];
    let skipped = 0;
    const sourceFormat = this.data.sourceFormats[this.data.sourceIndex];
    const allowedExt = this._getAllowedExtensions(sourceFormat);

    for (const file of tempFiles) {
      const extWithDot = getExt(file.name);

      // 严格验证：文件扩展名必须匹配选择的源格式
      if (!extWithDot || !allowedExt.includes(extWithDot)) {
        skipped++;
        continue;
      }

      newFiles.push({
        path: file.path,
        name: file.name,
        size: formatSize(file.size),
        status: 'pending',
        taskId: undefined,
        downloadUrl: undefined,
        sourceFormat: sourceFormat,
        fileExt: extWithDot
      });
    }

    this.setData({ fileList: [...this.data.fileList, ...newFiles] });

    if (skipped > 0) {
      showToast(`已跳过 ${skipped} 个格式不匹配的文件`, 'none', 3000);
    }
  },

  _getAllowedExtensions(sourceFormat) {
    return DOCUMENT_ALLOWED_EXTENSIONS[sourceFormat] || [];
  },

  // ========== 转换逻辑 ==========

  async startConvert() {
    if (!this.data.fileList.length) return;
    if (this.data.sourceIndex === -1 || this.data.targetIndex === -1) {
      showToast('请先选择源格式和目标格式', 'none');
      return;
    }

    this.setData({ converting: true, progress: 0, progressText: '准备转换...' });

    const total = this.data.fileList.filter(f => f.status === 'pending').length;
    let done = 0;

    for (let i = 0; i < this.data.fileList.length; i++) {
      const item = this.data.fileList[i];
      if (item.status !== 'pending') continue;

      this._updateFileStatus(i, 'processing');

      try {
        const target = this.data.availableTargets[this.data.targetIndex];
        const sourceFormat = this.data.sourceFormats[this.data.sourceIndex];

        const task = await createDocumentConvertTask({
          filePath: item.path,
          targetFormat: target,
          sourceFormat: sourceFormat
        });

        this._updateFileTaskId(i, task.taskId);

        await this._pollTask(i, task.taskId);

        done++;
        const progress = Math.round((done / total) * 100);
        this.setData({ progress, progressText: `已转换 ${done}/${total} 个文件` });
      } catch (err) {
        console.error('转换失败:', err);
        this._updateFileStatus(i, 'error');
        showToast(`文件 ${item.name} 转换失败`, 'none');
      }
    }

    this.setData({ converting: false });
    showToast('批量转换完成', 'success');
  },

  async _pollTask(index, taskId) {
    const result = await pollTaskUntilComplete(
      taskId,
      queryTask,
      (progress) => {
        if (this.data.progress < progress) {
          this.setData({ progress, progressText: `正在转换...` });
        }
      }
    );

    const next = [...this.data.fileList];
    next[index] = {
      ...next[index],
      status: 'success',
      downloadUrl: result.url,
      taskId
    };
    this.setData({ fileList: next });
  },

  _updateFileStatus(index, status) {
    const next = [...this.data.fileList];
    next[index] = { ...next[index], status };
    this.setData({ fileList: next });
  },

  _updateFileTaskId(index, taskId) {
    const next = [...this.data.fileList];
    next[index] = { ...next[index], taskId };
    this.setData({ fileList: next });
  },

  // ========== 文件操作 (下载/预览/分享) ==========

  // 预览文件：使用微信原生 openDocument
  async previewFile(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.fileList[index];
    if (!item?.downloadUrl) return;

    // 新增：预览格式检查
    let ext = '';
    if (item.downloadUrl) {
      const cleanUrl = item.downloadUrl.split('?')[0];
      ext = getExt(cleanUrl);
    } else {
      ext = getExt(item.name);
    }

    const SUPPORTED_DOC_FORMATS = ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.pdf'];

    if (!SUPPORTED_DOC_FORMATS.includes(ext.toLowerCase())) {
      wx.showModal({
        title: '不支持预览',
        content: `小程序暂不支持直接打开 ${ext} 格式，请复制链接后在浏览器中查看。`,
        confirmText: '复制链接',
        success: (res) => {
          if (res.confirm) {
            const url = normalizeFileUrl ? normalizeFileUrl(item.downloadUrl) : item.downloadUrl;
            wx.setClipboardData({
              data: url,
              success: () => showToast('链接已复制')
            });
          }
        }
      });
      return;
    }

    showLoading('加载中...');
    try {
      const fileUrl = normalizeFileUrl(item.downloadUrl);
      const tempPath = await downloadFileUtil(fileUrl);
      hideLoading();

      wx.openDocument({
        filePath: tempPath,
        showMenu: true,
        success: () => console.log('预览成功'),
        fail: (_err) => {
          showToast('无法预览该格式，请尝试下载', 'none');
        }
      });
    } catch (err) {
      hideLoading();
      showToast('预览加载失败', 'none');
    }
  },

  // 【修改点】下载文件：改为复制链接引导
  downloadFile(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.fileList[index];
    if (!item?.downloadUrl) return;

    const fileUrl = normalizeFileUrl(item.downloadUrl);

    wx.showModal({
      title: '下载提示',
      content: '请复制链接后在浏览器中打开下载文件。',
      confirmText: '复制链接',
      success: (res) => {
        if (res.confirm) {
          wx.setClipboardData({
            data: fileUrl,
            success: () => showToast('链接已复制')
          });
        }
      }
    });
  },

  // 【修改点】分享文件：使用 shareFileMessage
  async shareFile(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.fileList[index];
    if (!item?.downloadUrl) return;

    showLoading('准备分享...');

    try {
      const fileUrl = normalizeFileUrl(item.downloadUrl);
      const tempPath = await downloadFileUtil(fileUrl);
      hideLoading();

      if (wx.canIUse('shareFileMessage')) {
        wx.shareFileMessage({
          filePath: tempPath,
          fileName: item.name, // 保持原始文件名
          success: () => console.log('分享成功'),
          fail: (err) => {
            if (err.errMsg && !err.errMsg.includes('cancel')) {
              this._copyLinkFallback(fileUrl);
            }
          }
        });
      } else {
        this._copyLinkFallback(fileUrl);
      }
    } catch (err) {
      hideLoading();
      showToast('分享准备失败', 'none');
    }
  },

  _copyLinkFallback(url) {
    wx.setClipboardData({
      data: url,
      success: () => showToast('已复制文件链接')
    });
  },

  // 删除文件
  removeFile(e) {
    const index = Number(e.currentTarget.dataset.index);
    const next = [...this.data.fileList];
    next.splice(index, 1);
    this.setData({ fileList: next });
  },

  // 模板工具函数
  getFileIcon(filename) {
    const ext = getExt(filename).toLowerCase();
    return getFileIconFromFormat(ext);
  },

  isTargetPreviewSupported(fileItem) {
    // 简单判断，只要有 URL 就认为可以尝试预览或下载
    return !!fileItem.downloadUrl;
  },

  _getExt(name) {
    return getExt(name);
  },

  _formatSize(bytes) {
    return formatSize(bytes);
  }
});
