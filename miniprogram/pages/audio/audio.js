/**
 * 音频转换页面
 * 支持 mp3, wav, aac, flac, m4a, ogg, wma 等格式互转
 */
const { formatSize, getExt, showLoading, hideLoading, showToast } = require('../../utils/common');
const { chooseMessageFile, downloadFile: downloadFileUtil } = require('../../utils/file');
const {
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

// 格式化时间辅助函数 00:00
const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

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
    progressText: '',
    formatDisplayNames: AUDIO_FORMAT_DISPLAY_NAMES,

    // 播放器状态
    showPreviewModal: false,
    previewSrc: '',
    previewName: '',
    isPlaying: false,
    currentTimeStr: '00:00',
    durationStr: '00:00',
    currentProgress: 0,
    duration: 0,
    isSliding: false // 防止拖动进度条时被自动更新打断
  },

  onLoad() {
    this.loadSupportedFormats();
  },

  onUnload() {
    // 页面卸载时销毁音频实例
    if (this._audioContext) {
      this._audioContext.destroy();
    }
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
      console.warn('加载支持的格式失败，使用默认配置:', error);
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

    // 直接调用 chooseMessageFile，这是小程序获取非媒体文件的唯一标准途径
    // 它可以选择"聊天文件"（包括手机上传到文件传输助手的文件）
    this.chooseFile(allowedExt);
  },

  async chooseFile(allowedExt) {
    try {
      const tempFiles = await chooseMessageFile(allowedExt, 9);
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
        status: 'pending',
        taskId: undefined,
        downloadUrl: undefined
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

    this.setData({ converting: true, progress: 0, progressText: '准备转换...' });

    const total = this.data.fileList.length;
    let done = 0;

    for (let i = 0; i < this.data.fileList.length; i++) {
      const item = this.data.fileList[i];
      if (item.status !== 'pending') continue;

      const next = [...this.data.fileList];
      next[i] = { ...item, status: 'processing' };
      this.setData({ fileList: next });

      try {
        const target = this.data.availableTargets[this.data.targetIndex];
        const task = await createAudioConvertTask({
          filePath: item.path,
          targetFormat: target
        });
        next[i] = { ...next[i], taskId: task.taskId };
        this.setData({ fileList: next });

        await this._pollTask(i, task.taskId);

        done++;
        const progress = Math.round((done / total) * 100);
        this.setData({ progress, progressText: `已转换 ${done}/${total} 个文件` });
      } catch (err) {
        const nextErr = [...this.data.fileList];
        nextErr[i] = { ...nextErr[i], status: 'error' };
        this.setData({ fileList: nextErr });
        showToast(`文件 ${item.name} 转换失败`);
      }
    }

    this.setData({ converting: false, progressText: '转换完成' });
    wx.showToast({ title: '批量转换完成', icon: 'success' });
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

      if (status.state === 'finished' && status.url) {
        const next = [...this.data.fileList];
        next[index] = { ...next[index], status: 'success', downloadUrl: status.url, taskId };
        this.setData({ fileList: next, progress: 100, progressText: '转换完成' });
        return;
      }

      if (status.state === 'error') {
        const nextErr = [...this.data.fileList];
        nextErr[index] = { ...nextErr[index], status: 'error' };
        this.setData({ fileList: nextErr });
        throw new Error(status.message || '转换失败');
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    const nextErr = [...this.data.fileList];
    nextErr[index] = { ...nextErr[index], status: 'error' };
    this.setData({ fileList: nextErr });
    throw new Error('转换超时');
  },

  // ========== 文件操作：下载与分享 ==========

  // 【下载逻辑修改】改为显示链接引导浏览器下载
  downloadFile(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.fileList[index];
    if (!item || !item.downloadUrl) return;

    const downloadUrl = normalizeFileUrl(item.downloadUrl);

    wx.showModal({
      title: '提示',
      content: '由于小程序限制，请复制链接后在浏览器中打开下载。',
      confirmText: '复制链接',
      success: (res) => {
        if (res.confirm) {
          wx.setClipboardData({
            data: downloadUrl,
            success: () => {
              showToast('链接已复制');
            }
          });
        }
      }
    });
  },

  removeFile(e) {
    const index = Number(e.currentTarget.dataset.index);
    const next = [...this.data.fileList];
    next.splice(index, 1);
    this.setData({ fileList: next });
  },

  // 【分享逻辑修改】确保使用文件转发
  async shareFile(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.fileList[index];
    if (!item || !item.downloadUrl) return;

    // 必须先下载到本地临时路径，才能进行文件卡片转发
    showLoading('准备文件...');

    try {
      const downloadUrl = normalizeFileUrl(item.downloadUrl);
      const tempPath = await downloadFileUtil(downloadUrl);
      hideLoading();

      // 使用 shareFileMessage 发送文件卡片
      if (wx.canIUse('shareFileMessage')) {
        wx.shareFileMessage({
          filePath: tempPath,
          fileName: item.name, // 确保转发时显示正确的文件名
          success: () => {
            console.log('转发成功');
          },
          fail: (err) => {
            // 用户取消或失败
            if (err.errMsg && !err.errMsg.includes('cancel')) {
              showToast('无法调起分享');
            }
          }
        });
      } else {
        // 低版本兼容：复制链接
        this._copyLinkFallback(downloadUrl);
      }
    } catch (err) {
      hideLoading();
      showToast('文件下载失败，无法分享');
    }
  },

  _copyLinkFallback(url) {
    wx.setClipboardData({
      data: url,
      success: () => showToast('版本过低，链接已复制'),
      fail: () => showToast('分享失败')
    });
  },

  // ========== 预览功能 (播放器重构) ==========

  async previewFile(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.fileList[index];
    if (!item || !item.downloadUrl) return;

    // 预览格式检查
    let fileExt = '';
    if (item.downloadUrl) {
      const cleanUrl = item.downloadUrl.split('?')[0];
      fileExt = getExt(cleanUrl);
    } else {
      fileExt = getExt(item.name);
    }

    // 2. 预览格式白名单（确保均为小写）
    const SUPPORTED_PREVIEW_FORMATS = ['.mp3', '.aac', '.m4a', '.wav'];

    // 3. 检查是否支持
    if (!SUPPORTED_PREVIEW_FORMATS.includes(fileExt.toLowerCase())) {
      wx.showModal({
        title: '不支持预览',
        content: `小程序暂不支持直接播放 ${fileExt} 格式，请复制链接后在浏览器中播放。`,
        confirmText: '复制链接',
        success: (res) => {
          if (res.confirm) {
            this._copyLinkFallback(normalizeFileUrl(item.downloadUrl));
          }
        }
      });
      return;
    }

    showLoading('加载音频...');

    try {
      const downloadUrl = normalizeFileUrl(item.downloadUrl);
      const tempPath = await downloadFileUtil(downloadUrl);
      hideLoading();

      this.setData({
        previewSrc: tempPath,
        previewName: item.name || '音频预览',
        showPreviewModal: true
      });

      // 初始化播放器
      this._initAudio(tempPath);

    } catch (err) {
      hideLoading();
      showToast('加载失败，无法预览');
    }
  },

  // 初始化 InnerAudioContext
  _initAudio(src) {
    if (this._audioContext) {
      this._audioContext.destroy();
    }

    const ctx = wx.createInnerAudioContext();
    ctx.src = src;

    // 监听状态
    ctx.onPlay(() => this.setData({ isPlaying: true }));
    ctx.onPause(() => this.setData({ isPlaying: false }));
    ctx.onStop(() => this.setData({ isPlaying: false, currentProgress: 0, currentTimeStr: '00:00' }));
    ctx.onEnded(() => this.setData({ isPlaying: false, currentProgress: 0, currentTimeStr: '00:00' }));

    // 监听进度更新
    ctx.onTimeUpdate(() => {
      // 如果正在拖动滑块，则不更新进度条，避免跳动
      if (this.data.isSliding) return;

      const currentTime = ctx.currentTime;
      const duration = ctx.duration;
      // 避免除以0
      const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

      this.setData({
        currentTimeStr: formatTime(currentTime),
        durationStr: formatTime(duration),
        currentProgress: progress,
        duration: duration
      });
    });

    ctx.onError((res) => {
      showToast('播放失败');
      console.error(res);
    });

    this._audioContext = ctx;
    // 自动播放
    ctx.play();
  },

  // 播放/暂停控制
  togglePlay() {
    if (this._audioContext) {
      if (this.data.isPlaying) {
        this._audioContext.pause();
      } else {
        this._audioContext.play();
      }
    }
  },

  // 拖动进度条跳转
  seekAudio(e) {
    const value = e.detail.value;
    if (this._audioContext && this.data.duration) {
      const seekTime = (value / 100) * this.data.duration;
      this._audioContext.seek(seekTime);
    }
    this.setData({ isSliding: false });
  },

  // 正在拖动进度条
  sliderChanging(_e) {
    this.setData({ isSliding: true });
  },

  // 遮罩层点击
  onOverlayTap() {
    this.closePreview();
  },

  // 关闭预览
  closePreview() {
    if (this._audioContext) {
      this._audioContext.stop();
    }
    this.setData({
      showPreviewModal: false,
      isPlaying: false,
      previewSrc: '',
      previewName: '',
      currentProgress: 0,
      currentTimeStr: '00:00',
      durationStr: '00:00'
    });
  },

  // 阻止冒泡
  stopProp() { }
});
