/**
 * 文档转换页面
 * 重构版本 - 使用模块化工具函数
 */

const { formatSize, getExt, showToast } = require('../../utils/common');
const { previewDocument, downloadAndSaveFile, shareRemoteFile, chooseMessageFile } = require('../../utils/file');
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
    targetFormatNames: "",

    // 转换映射
    conversionMap: { ...DOCUMENT_CONVERSION_MAP },

    // 文件列表
    fileList: [],
    converting: false,
    progress: 0,
    progressText: "",

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
      showToast('服务连接正常', 'success');
    } catch (err) {
      console.error('❌ 服务连接失败:', err);
      showToast('服务连接失败', 'none');
    }
  },

  // 加载服务器支持的格式
  async loadFormats() {
    try {
      const result = await loadSupportedFormats('document');
      console.log('格式加载响应:', result);

      if (result?.document?.supportedConversions) {
        this.setData({ conversionMap: result.document.supportedConversions });
        console.log('使用服务器支持的格式');
      } else {
        console.warn('服务器返回格式数据异常，使用默认配置');
      }
    } catch (error) {
      console.warn("加载支持的格式失败，使用默认配置:", error);
    }
  },

  // 选择源格式
  selectSourceFormat(e) {
    const index = Number(e.currentTarget.dataset.index);
    const sourceFormat = this.data.sourceFormats[index];
    const availableTargets = this.data.conversionMap[sourceFormat] || [];
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

  // 打开文件选择
  chooseFileAction() {
    if (this.data.sourceIndex === -1) {
      showToast('请先选择源文件格式', 'none');
      return;
    }

    const sourceFormat = this.data.sourceFormats[this.data.sourceIndex];
    const allowedExt = this._getAllowedExtensions(sourceFormat);

    console.log('选择的源格式:', sourceFormat, '允许的扩展名:', allowedExt);

    wx.showActionSheet({
      itemList: ["从微信文件选择", "从文件管理器选择"],
      success: (res) => {
        this.chooseFile(allowedExt);
      }
    });
  },

  // 微信文件选择
  async chooseFile(allowedExt) {
    console.log('微信文件选择器 - 允许的扩展名:', allowedExt);
    try {
      const tempFiles = await chooseMessageFile(allowedExt, 9);
      console.log('选择的文件:', tempFiles);
      this._processSelectedFiles(tempFiles);
    } catch (err) {
      console.error('文件选择失败:', err);
      showToast('文件选择失败', 'none');
    }
  },

  // 处理已选文件
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
        console.warn(`文件格式不匹配: 选择的是${sourceFormat}格式，但文件是${extWithDot}格式`, file.name);
        continue;
      }

      newFiles.push({
        path: file.path,
        name: file.name,
        size: formatSize(file.size),
        status: "pending",
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

  // 获取允许的扩展名
  _getAllowedExtensions(sourceFormat) {
    return DOCUMENT_ALLOWED_EXTENSIONS[sourceFormat] || [];
  },

  // 开始转换
  async startConvert() {
    if (!this.data.fileList.length) return;
    if (this.data.sourceIndex === -1 || this.data.targetIndex === -1) {
      showToast('请先选择源格式和目标格式', 'none');
      return;
    }

    this.setData({ converting: true, progress: 0, progressText: "准备转换..." });

    const total = this.data.fileList.filter(f => f.status === 'pending').length;
    let done = 0;

    for (let i = 0; i < this.data.fileList.length; i++) {
      const item = this.data.fileList[i];
      if (item.status !== "pending") continue;

      this._updateFileStatus(i, "processing");

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
        this._updateFileStatus(i, "error");
        showToast(`文件 ${item.name} 转换失败`, 'none');
      }
    }

    this.setData({ converting: false });
    showToast("批量转换完成", 'success');
  },

  // 轮询任务
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
      status: "success",
      downloadUrl: result.url,
      taskId
    };
    this.setData({ fileList: next });
  },

  // 更新文件状态
  _updateFileStatus(index, status) {
    const next = [...this.data.fileList];
    next[index] = { ...next[index], status };
    this.setData({ fileList: next });
  },

  // 更新文件任务 ID
  _updateFileTaskId(index, taskId) {
    const next = [...this.data.fileList];
    next[index] = { ...next[index], taskId };
    this.setData({ fileList: next });
  },

  // 预览文件
  async previewFile(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.fileList[index];
    if (!item?.downloadUrl) {
      showToast("文件尚未转换完成", 'none');
      return;
    }

    const fileUrl = normalizeFileUrl(item.downloadUrl);
    console.log('预览文件 URL (normalized):', fileUrl);

    try {
      await previewDocument(fileUrl, item.name);
    } catch (err) {
      console.error('预览失败:', err);
    }
  },

  // 下载文件
  async downloadFile(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.fileList[index];
    if (!item?.downloadUrl) {
      showToast("文件尚未转换完成", 'none');
      return;
    }

    const fileUrl = normalizeFileUrl(item.downloadUrl);
    console.log('下载文件 URL (normalized):', fileUrl);

    try {
      await downloadAndSaveFile(fileUrl, item.name);
    } catch (err) {
      console.error('下载失败:', err);
    }
  },

  // 分享文件
  async shareFile(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.fileList[index];
    if (!item?.downloadUrl) {
      showToast("文件尚未转换完成", 'none');
      return;
    }

    const fileUrl = normalizeFileUrl(item.downloadUrl);
    console.log('分享文件 URL (normalized):', fileUrl);

    try {
      await shareRemoteFile(fileUrl);
    } catch (err) {
      console.error('分享失败:', err);
    }
  },

  // 删除文件
  removeFile(e) {
    const index = Number(e.currentTarget.dataset.index);
    const next = [...this.data.fileList];
    next.splice(index, 1);
    this.setData({ fileList: next });
  },

  // 获取文件图标（供模板调用）
  getFileIcon(filename) {
    const ext = getExt(filename).toLowerCase();
    return getFileIconFromFormat(ext);
  },

  // 检查是否支持预览
  isPreviewSupported(filename) {
    const ext = getExt(filename).toLowerCase();
    const previewableExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'];
    return previewableExts.includes(ext);
  },

  // 检查目标文件是否支持预览
  isTargetPreviewSupported(fileItem) {
    if (!fileItem.downloadUrl) return false;
    const targetExt = getExt(fileItem.downloadUrl).toLowerCase();
    const previewableExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'];
    return previewableExts.includes(targetExt);
  },

  // 提取扩展名（供模板调用）
  _getExt(name) {
    return getExt(name);
  },

  // 格式化文件大小（供模板调用）
  _formatSize(bytes) {
    return formatSize(bytes);
  }
});