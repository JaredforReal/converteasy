/**
 * 音频转换页面
 * 支持 mp3, wav, aac, flac, m4a, ogg, wma 等格式互转
 */
const { formatSize, getExt, showLoading, hideLoading, showToast } = require('../../utils/common');
const { chooseMessageFile, downloadFile: downloadFileUtil, saveFile, shareFile: shareFileUtil } = require('../../utils/file');
const {
  getBaseUrl,
  normalizeFileUrl,
  createAudioConvertTask,
  queryTask,
  loadSupportedFormats
} = require('../../utils/api');
const {
  AUDIO_SOURCE_FORMATS,
  AUDIO_FORMAT_DISPLAY_NAMES,
  AUDIO_CONVERSION_MAP,
  AUDIO_ALLOWED_EXTENSIONS,
  getFormatDisplayName
} = require('../../utils/formats');

Page({
  data: {
    sourceFormats: AUDIO_SOURCE_FORMATS,
    sourceIndex: -1,
    targetFormats: AUDIO_SOURCE_FORMATS,
    targetIndex: -1,
    availableTargets: [],
    conversionMap: AUDIO_CONVERSION_MAP,
    fileList: [],
    converting: false,
    progress: 0,
    progressText: "",
    formatDisplayNames: AUDIO_FORMAT_DISPLAY_NAMES,

    // 预览面板相关
    showPreviewModal: false,
    previewSrc: "",
    previewName: "",
  },

  onLoad() {
    this.loadSupportedFormats();
  },

  // ========== 格式加载 ==========

  async loadSupportedFormats() {
    try {
      const response = await loadSupportedFormats('audio');
      if (response.audio && response.audio.supportedConversions) {
        this.setData({
          conversionMap: response.audio.supportedConversions
        });
      }
    } catch (error) {
      console.warn("加载支持的格式失败，使用默认配置:", error);
    }
  },

  // ========== 格式选择 ==========

  selectSourceFormat(e) {
    const index = Number(e.currentTarget.dataset.index);
    const sourceFormat = this.data.sourceFormats[index];
    const availableTargets = this.data.conversionMap[sourceFormat] || [];

    this.setData({
      sourceIndex: index,
      availableTargets: availableTargets,
      targetIndex: availableTargets.length > 0 ? 0 : -1
    });
  },

  selectTargetFormat(e) {
    const index = Number(e.currentTarget.dataset.index);
    this.setData({ targetIndex: index });
  },

  // ========== 文件选择 ==========

  chooseFileAction() {
    if (this.data.sourceIndex === -1) {
      showToast('请先选择源文件格式');
      return;
    }

    const sourceFormat = this.data.sourceFormats[this.data.sourceIndex];
    const allowedExt = AUDIO_ALLOWED_EXTENSIONS[sourceFormat] || [];

    wx.showActionSheet({
      itemList: ["从微信文件选择", "从本地选择"],
      success: (res) => {
        this.chooseFile(allowedExt);
      }
    });
  },

  async chooseFile(allowedExt) {
    try {
      const tempFiles = await chooseMessageFile({ count: 9, extension: allowedExt });
      this._processSelectedFiles(tempFiles, allowedExt);
    } catch (err) {
      if (err.errMsg && !err.errMsg.includes('cancel')) {
        showToast('选择文件失败');
      }
    }
  },

  _processSelectedFiles(tempFiles, allowedExt) {
    const newFiles = [];
    let skipped = 0;

    for (const file of tempFiles) {
      const ext = getExt(file.name);
      if (!allowedExt.includes(ext)) {
        skipped++;
        continue;
      }
      newFiles.push({
        path: file.path,
        name: file.name,
        size: formatSize(file.size),
        status: "pending",
        taskId: undefined,
        downloadUrl: undefined,
      });
    }

    this.setData({ fileList: [...this.data.fileList, ...newFiles] });

    if (skipped > 0) {
      const sourceFormat = this.data.sourceFormats[this.data.sourceIndex];
      const formatName = getFormatDisplayName(sourceFormat, 'audio');
      showToast(`已过滤 ${skipped} 个非${formatName}文件`);
    }
  },

  // ========== 转换逻辑 ==========

  async startConvert() {
    if (!this.data.fileList.length) return;
    if (this.data.sourceIndex === -1 || this.data.targetIndex === -1) {
      showToast('请先选择源格式和目标格式');
      return;
    }

    this.setData({ converting: true, progress: 0, progressText: "准备转换..." });

    const total = this.data.fileList.length;
    let done = 0;

    for (let i = 0; i < this.data.fileList.length; i++) {
      const item = this.data.fileList[i];
      if (item.status !== "pending") continue;

      const next = [...this.data.fileList];
      next[i] = { ...item, status: "processing" };
      this.setData({ fileList: next });

      try {
        const target = this.data.availableTargets[this.data.targetIndex];
        const task = await createAudioConvertTask(item.path, target);
        next[i] = { ...next[i], taskId: task.taskId };
        this.setData({ fileList: next });

        await this._pollTask(i, task.taskId);

        done++;
        const progress = Math.round((done / total) * 100);
        this.setData({ progress, progressText: `已转换 ${done}/${total} 个文件` });
      } catch (err) {
        const nextErr = [...this.data.fileList];
        nextErr[i] = { ...nextErr[i], status: "error" };
        this.setData({ fileList: nextErr });
        showToast(`文件 ${item.name} 转换失败`);
      }
    }

    this.setData({ converting: false, progressText: "转换完成" });
    wx.showToast({ title: "批量转换完成", icon: "success" });
  },

  async _pollTask(index, taskId) {
    const start = Date.now();
    const timeout = 5 * 60 * 1000;

    while (Date.now() - start < timeout) {
      const status = await queryTask(taskId);
      const elapsed = Date.now() - start;
      const smooth = Math.min(90, Math.max(5, Math.floor(elapsed / 1000) * 3));

      if (this.data.progress < smooth) {
        this.setData({ progress: smooth, progressText: `正在转换...` });
      }

      if (status.state === "finished" && status.url) {
        const next = [...this.data.fileList];
        next[index] = { ...next[index], status: "success", downloadUrl: status.url, taskId };
        this.setData({ fileList: next, progress: 100, progressText: "转换完成" });
        return;
      }

      if (status.state === "error") {
        const nextErr = [...this.data.fileList];
        nextErr[index] = { ...nextErr[index], status: "error" };
        this.setData({ fileList: nextErr });
        throw new Error(status.message || "转换失败");
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    const nextErr = [...this.data.fileList];
    nextErr[index] = { ...nextErr[index], status: "error" };
    this.setData({ fileList: nextErr });
    throw new Error("转换超时");
  },

  // ========== 文件操作 ==========

  async downloadFile(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.fileList[index];
    if (!item || !item.downloadUrl) return;

    showLoading("下载中...");

    try {
      const downloadUrl = normalizeFileUrl(item.downloadUrl);
      const tempPath = await downloadFileUtil(downloadUrl);

      try {
        await saveFile(tempPath);
        hideLoading();
        wx.showToast({ title: "音频已保存到手机", icon: "success" });
      } catch (saveErr) {
        // 保存失败时播放音频
        hideLoading();
        this._playAudio(tempPath);
      }
    } catch (err) {
      hideLoading();
      showToast(err.message || "下载失败");
    }
  },

  _playAudio(tempPath) {
    const audio = wx.createInnerAudioContext();
    audio.src = tempPath;
    audio.play();
    showToast("正在播放音频");
    audio.onEnded(() => audio.destroy());
    audio.onError(() => {
      audio.destroy();
      showToast("音频播放失败");
    });
  },

  removeFile(e) {
    const index = Number(e.currentTarget.dataset.index);
    const next = [...this.data.fileList];
    next.splice(index, 1);
    this.setData({ fileList: next });
  },

  async shareFile(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.fileList[index];
    if (!item || !item.downloadUrl) return;

    showLoading("准备分享...");

    try {
      const downloadUrl = normalizeFileUrl(item.downloadUrl);
      const tempPath = await downloadFileUtil(downloadUrl);
      hideLoading();

      if (wx.canIUse('shareFileMessage')) {
        wx.shareFileMessage({
          filePath: tempPath,
          fail: () => this._copyLinkFallback(downloadUrl)
        });
      } else {
        this._copyLinkFallback(downloadUrl);
      }
    } catch (err) {
      hideLoading();
      showToast(err.message || "分享失败");
    }
  },

  _copyLinkFallback(url) {
    wx.setClipboardData({
      data: url,
      success: () => showToast("链接已复制，可分享给好友"),
      fail: () => showToast("分享失败")
    });
  },

  // ========== 预览功能 ==========

  async previewFile(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.fileList[index];
    if (!item || !item.downloadUrl) return;

    showLoading("准备预览...");

    try {
      const downloadUrl = normalizeFileUrl(item.downloadUrl);
      const tempPath = await downloadFileUtil(downloadUrl);
      hideLoading();

      this.setData({
        previewSrc: tempPath,
        previewName: item.name || "音频预览",
        showPreviewModal: true,
      });
    } catch (err) {
      hideLoading();
      showToast("下载失败，无法预览");
    }
  },

  onOverlayTap() {
    this.closePreview();
  },

  closePreview() {
    try {
      const audioCtx = wx.createAudioContext && wx.createAudioContext('previewAudio', this);
      if (audioCtx && audioCtx.pause) {
        audioCtx.pause();
      }
    } catch (e) {
      // 忽略错误
    }

    this.setData({
      showPreviewModal: false,
      previewSrc: "",
      previewName: "",
    });
  },
});