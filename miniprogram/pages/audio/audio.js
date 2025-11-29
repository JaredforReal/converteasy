// pages/audio/audio.js
const app = getApp();

Page({
  data: {
    sourceFormats: ["mp3", "wav", "aac", "flac", "m4a", "ogg", "wma"],
    sourceIndex: -1,
    targetFormats: ["mp3", "wav", "aac", "flac", "m4a", "ogg", "wma"],
    targetIndex: -1,
    availableTargets: [],
    conversionMap: {
      "mp3": ["wav", "aac", "flac", "m4a", "ogg", "wma"],
      "wav": ["mp3", "aac", "flac", "m4a", "ogg", "wma"],
      "aac": ["mp3", "wav", "m4a", "flac"],
      "flac": ["wav", "mp3", "aac"],
      "ogg": ["mp3", "wav", "flac"],
      "m4a": ["mp3", "wav", "aac"],
      "wma": ["mp3", "wav", "aac"]
    },
    fileList: [],
    converting: false,
    progress: 0,
    progressText: "",
    formatDisplayNames: {
      "mp3": "MP3",
      "wav": "WAV", 
      "aac": "AAC",
      "flac": "FLAC",
      "m4a": "M4A",
      "ogg": "OGG",
      "wma": "WMA"
    },

    // 预览面板相关
    showPreviewModal: false,
    previewSrc: "",
    previewName: "",
  },

  onLoad() {
    this.loadSupportedFormats();
  },

  // 从服务器加载支持的格式
  async loadSupportedFormats() {
    try {
      const url = `${this._getBaseUrl()}/supported-formats?category=audio`;
      const response = await new Promise((resolve, reject) => {
        wx.request({
          url,
          method: "GET",
          success: (res) => {
            if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
            else reject(new Error(`加载失败(${res.statusCode})`));
          },
          fail: (err) => reject(err)
        });
      });
      
      if (response.audio && response.audio.supportedConversions) {
        this.setData({
          conversionMap: response.audio.supportedConversions
        });
      }
    } catch (error) {
      console.warn("加载支持的格式失败，使用默认配置:", error);
    }
  },

  selectSourceFormat(e) {
    const index = Number(e.currentTarget.dataset.index);
    const sourceFormat = this.data.sourceFormats[index];
    
    // 获取该源格式支持转换的目标格式
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

  chooseFileAction() {
    const that = this;
    
    // 检查是否已选择源格式
    if (this.data.sourceIndex === -1) {
      wx.showToast({
        title: '请先选择源文件格式',
        icon: 'none'
      });
      return;
    }

    const sourceFormat = this.data.sourceFormats[this.data.sourceIndex];
    const allowedExt = this._getAllowedExtensions(sourceFormat);
    
    wx.showActionSheet({
      itemList: ["从微信文件选择", "从本地选择"],
      success(res) {
        if (res.tapIndex === 0) {
          that.chooseFile(allowedExt);
        } else {
          that._chooseFromLocal(allowedExt);
        }
      }
    });
  },

  chooseFile(allowedExt) {
    wx.chooseMessageFile({
      count: 9,
      type: "file",
      extension: allowedExt,
      success: (res) => {
        this._processSelectedFiles(res.tempFiles, allowedExt);
      },
    });
  },

  _chooseFromLocal(allowedExt) {
    wx.chooseMessageFile({
      count: 9,
      type: "file",
      extension: allowedExt,
      success: (res) => {
        this._processSelectedFiles(res.tempFiles, allowedExt);
      },
    });
  },

  _processSelectedFiles(tempFiles, allowedExt) {
    const newFiles = [];
    let skipped = 0;
    
    for (const file of tempFiles) {
      const ext = this._getExt(file.name);
      if (!allowedExt.includes(ext)) { 
        skipped++; 
        continue; 
      }
      newFiles.push({
        path: file.path,
        name: file.name,
        size: this._formatSize(file.size),
        status: "pending",
        taskId: undefined,
        downloadUrl: undefined,
      });
    }
    
    this.setData({ fileList: [...this.data.fileList, ...newFiles] });
    
    if (skipped > 0) {
      const sourceFormat = this.data.sourceFormats[this.data.sourceIndex];
      const formatName = this.data.formatDisplayNames[sourceFormat] || sourceFormat.toUpperCase();
      wx.showToast({ 
        title: `已过滤 ${skipped} 个非${formatName}文件`, 
        icon: "none" 
      });
    }
  },

  // 根据源格式获取允许的文件扩展名
  _getAllowedExtensions(sourceFormat) {
    const formatToExt = {
      "mp3": [".mp3"],
      "wav": [".wav"],
      "aac": [".aac"],
      "flac": [".flac"],
      "m4a": [".m4a"],
      "ogg": [".ogg"],
      "wma": [".wma"]
    };
    return formatToExt[sourceFormat] || [];
  },

  async startConvert() {
    if (!this.data.fileList.length) return;
    if (this.data.sourceIndex === -1 || this.data.targetIndex === -1) {
      wx.showToast({
        title: '请先选择源格式和目标格式',
        icon: 'none'
      });
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
        const task = await this._uploadForConvert({
          filePath: item.path,
          targetFormat: target,
          category: "audio",
        });
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
        wx.showToast({ title: `文件 ${item.name} 转换失败`, icon: "none" });
      }
    }

    this.setData({ converting: false, progressText: "转换完成" });
    wx.showToast({ title: "批量转换完成", icon: "success" });
  },

  async _pollTask(index, taskId) {
    const start = Date.now();
    const timeout = 5 * 60 * 1000;
    while (Date.now() - start < timeout) {
      const status = await this._queryTask(taskId);
      const elapsed = Date.now() - start;
      const smooth = Math.min(90, Math.max(5, Math.floor(elapsed / 1000) * 3));
      if (this.data.progress < smooth) this.setData({ progress: smooth, progressText: `正在转换...` });

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

  downloadFile(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.fileList[index];
    if (!item || !item.downloadUrl) return;

    wx.showLoading({ title: "下载中..." });

    this._downloadAudioFile(item.downloadUrl)
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: "下载成功", icon: "success" });
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: err.message || "下载失败", icon: "none" });
      });
  },

  removeFile(e) {
    const index = Number(e.currentTarget.dataset.index);
    const next = [...this.data.fileList];
    next.splice(index, 1);
    this.setData({ fileList: next });
  },

  shareFile(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.fileList[index];
    if (!item || !item.downloadUrl) return;

    wx.showLoading({ title: "准备分享..." });

    this._shareAudioFile(item.downloadUrl, item.name)
      .then(() => {
        wx.hideLoading();
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: err.message || "分享失败", icon: "none" });
      });
  },

  previewFile(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.fileList[index];
    if (!item || !item.downloadUrl) return;

    wx.showLoading({ title: "准备预览..." });

    let downloadUrl = item.downloadUrl;
    if (downloadUrl.startsWith("/")) {
      downloadUrl = this._getBaseUrl() + downloadUrl;
    }

    wx.downloadFile({
      url: downloadUrl,
      success: (res) => {
        wx.hideLoading();
        const tempPath = res.tempFilePath;
        this.setData({
          previewSrc: tempPath,
          previewName: item.name || "音频预览",
          showPreviewModal: true,
        });
      },
      fail: (err) => {
        wx.hideLoading();
        console.error("下载失败:", err);
        wx.showToast({ title: "下载失败，无法预览", icon: "none" });
      }
    });
  },

  onOverlayTap(e) {
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

  _downloadAudioFile(fileUrl) {
    return new Promise((resolve, reject) => {
      let downloadUrl = fileUrl;
      if (fileUrl.startsWith("/")) {
        downloadUrl = this._getBaseUrl() + fileUrl;
      }

      wx.downloadFile({
        url: downloadUrl,
        success: (res) => {
          const tempPath = res.tempFilePath;
          wx.saveFile({
            tempFilePath: tempPath,
            success: (saveRes) => {
              wx.showToast({
                title: "音频已保存到手机",
                icon: "success"
              });
              resolve();
            },
            fail: (saveErr) => {
              console.error("音频保存失败:", saveErr);
              const audio = wx.createInnerAudioContext();
              audio.src = tempPath;
              audio.play();
              wx.showToast({
                title: "正在播放音频",
                icon: "none"
              });
              audio.onEnded(() => {
                audio.destroy();
                resolve();
              });
              audio.onError(() => {
                audio.destroy();
                reject(new Error("音频播放失败"));
              });
            }
          });
        },
        fail: (err) => {
          reject(new Error("下载失败: " + (err.errMsg || "网络错误")));
        }
      });
    });
  },

  _shareAudioFile(fileUrl, fileName) {
    return new Promise((resolve, reject) => {
      let downloadUrl = fileUrl;
      if (fileUrl.startsWith("/")) {
        downloadUrl = this._getBaseUrl() + fileUrl;
      }

      wx.downloadFile({
        url: downloadUrl,
        success: (res) => {
          const tempPath = res.tempFilePath;
          if (wx.canIUse('shareFileMessage')) {
            wx.shareFileMessage({
              filePath: tempPath,
              success: resolve,
              fail: () => {
                wx.setClipboardData({
                  data: downloadUrl,
                  success: () => {
                    wx.showToast({
                      title: "链接已复制，可分享给好友",
                      icon: "none"
                    });
                    resolve();
                  },
                  fail: () => {
                    reject(new Error("分享失败"));
                  }
                });
              }
            });
          } else {
            wx.setClipboardData({
              data: downloadUrl,
              success: () => {
                wx.showToast({
                  title: "链接已复制，可分享给好友",
                  icon: "none"
                });
                resolve();
              },
              fail: () => {
                reject(new Error("分享失败"));
              }
            });
          }
        },
        fail: (err) => {
          reject(new Error("下载失败，无法分享"));
        }
      });
    });
  },

  _getBaseUrl() {
    if (app && app.globalData && app.globalData.apiBaseUrl) {
      return app.globalData.apiBaseUrl.replace(/\/$/, '');
    }
    throw new Error('服务器地址未配置');
  },

  _uploadForConvert({ filePath, targetFormat, category }) {
    const url = `${this._getBaseUrl()}/convert/upload`;
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url,
        filePath,
        name: "file",
        formData: { category, target: targetFormat },
        success: (res) => {
          try {
            console.log("[uploadFile] status=", res.statusCode, "data=", res.data);
            const data = JSON.parse(res.data || "{}");
            if (res.statusCode >= 200 && res.statusCode < 300 && data.taskId) {
              resolve({ taskId: data.taskId });
            } else {
              const raw = typeof res.data === 'string' ? res.data.slice(0, 200) : JSON.stringify(res.data);
              reject(new Error((data && data.message) || `上传失败(${res.statusCode}) ${raw}`));
            }
          } catch (e) {
            const snippet = (res && typeof res.data === 'string') ? res.data.slice(0, 200) : "";
            reject(new Error("响应解析失败 " + snippet));
          }
        },
        fail: (err) => {
          console.error("[uploadFile fail]", err);
          reject(new Error(err.errMsg || "上传请求失败"));
        },
      });
    });
  },

  _queryTask(taskId) {
    const url = `${this._getBaseUrl()}/convert/task/${taskId}`;
    return new Promise((resolve, reject) => {
      wx.request({
        url,
        method: "GET",
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data || {});
          else {
            const raw = typeof res.data === 'string' ? res.data.slice(0, 200) : JSON.stringify(res.data);
            reject(new Error(((res.data && res.data.message) || `查询失败(${res.statusCode}) ${raw}`)));
          }
        },
        fail: (err) => {
          console.error("[queryTask fail]", err);
          reject(new Error(err.errMsg || "查询请求失败"));
        },
      });
    });
  },

  _formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  },

  _getExt(name) {
    const i = name.lastIndexOf('.')
    return i >= 0 ? name.slice(i).toLowerCase() : ''
  },
});