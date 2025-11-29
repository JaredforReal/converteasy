const app = getApp();

// 可配置的公网域名：优先使用 app.globalData.PUBLIC_BASE_URL，否则使用下面的回退值（请替换为你的公网域名）
const PUBLIC_BASE_URL = (app && app.globalData && app.globalData.PUBLIC_BASE_URL)
  ? app.globalData.PUBLIC_BASE_URL
  : "https://convert-200072-6-1321764604.sh.run.tcloudbase.com";

Page({
  data: {
    // ---------- 源格式 ----------
    sourceFormats: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf", "html"],
    // 与 sourceFormats 完全对应，供 UI 展示
    sourceFormatDisplay: [
      "PDF",
      "Word(.doc)",
      "Word(.docx)",
      "Excel(.xls)",
      "Excel(.xlsx)",
      "PPT(.ppt)",
      "PPT(.pptx)",
      "TXT",
      "RTF",
      "HTML"
    ],

    sourceIndex: -1,

    // ---------- 目标格式 ----------
    targetFormats: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf", "html", "csv", "odt", "ods", "odp"],
    targetIndex: -1,
    availableTargets: [],
    itemDisplayNames: [],   // 目标格式的显示名称
    targetFormatNames: "",  // 目标格式拼接字符串

    // ---------- 转换映射 ----------
    conversionMap: {
      "pdf": ["doc", "docx", "ppt", "pptx", "xls", "xlsx", "txt", "rtf"],
      "doc": ["docx", "rtf", "txt", "odt", "html", "pdf"],
      "docx": ["doc", "rtf", "txt", "odt", "html", "pdf"],
      "xls": ["xlsx", "ods", "csv", "txt", "pdf", "doc"],
      "xlsx": ["xls", "ods", "csv", "txt", "pdf", "doc"],
      "ppt": ["pptx", "odp", "pdf"],
      "pptx": ["ppt", "odp", "pdf"],
      "txt": ["doc", "docx", "rtf", "odt", "pdf", "xls", "xlsx"],
      "rtf": ["doc", "docx", "txt", "odt"],
      "html": ["pdf", "doc", "docx"]
    },

    fileList: [],
    converting: false,
    progress: 0,
    progressText: "",

    // 目标格式的 UI 名称
    formatDisplayNames: {
      "pdf": "PDF",
      "doc": "Word(.doc)",
      "docx": "Word(.docx)",
      "xls": "Excel(.xls)",
      "xlsx": "Excel(.xlsx)",
      "ppt": "PPT(.ppt)",
      "pptx": "PPT(.pptx)",
      "txt": "TXT",
      "rtf": "RTF",
      "html": "HTML",
      "csv": "CSV",
      "odt": "ODT",
      "ods": "ODS",
      "odp": "ODP"
    }
  },

  onLoad() {
    console.log('云开发初始化状态:', wx.cloud);
    this.testCloudConnection();
    this.loadSupportedFormats();
  },

  // 测试云调用连接
  testCloudConnection() {
    wx.cloud.callContainer({
      config: {
        env: "prod-2gyfay7ve535c92a"
      },
      path: "/health",
      header: {
        "X-WX-SERVICE": "convert"
      },
      method: "GET",
      success: (res) => {
        console.log('✅ 云调用连接成功:', res);
        wx.showToast({ title: '云服务连接正常', icon: 'success' });
      },
      fail: (err) => {
        console.error('❌ 云调用连接失败:', err);
        wx.showToast({ title: '云服务连接失败', icon: 'none' });
      }
    });
  },

  // ---------- 加载服务器支持的格式 ----------
  async loadSupportedFormats() {
    try {
      const res = await wx.cloud.callContainer({
        config: {
          env: "prod-2gyfay7ve535c92a"
        },
        path: "/supported-formats?category=document",
        header: {
          "X-WX-SERVICE": "convert"
        },
        method: "GET"
      });
      
      console.log('格式加载响应:', res);
      
      if (res.data && res.data.document && res.data.document.supportedConversions) {
        this.setData({ conversionMap: res.data.document.supportedConversions });
        console.log('使用服务器支持的格式');
      } else {
        console.warn('服务器返回格式数据异常，使用默认配置');
      }
    } catch (error) {
      console.warn("加载支持的格式失败，使用默认配置:", error);
    }
  },

  // ---------- 选择源格式 ----------
  selectSourceFormat(e) {
    const index = Number(e.currentTarget.dataset.index);
    const sourceFormat = this.data.sourceFormats[index];

    const availableTargets = this.data.conversionMap[sourceFormat] || [];

    const itemDisplayNames = availableTargets.map(item =>
      this.data.formatDisplayNames[item] || item.toUpperCase()
    );
    const targetFormatNames = itemDisplayNames.join('、');

    this.setData({
      sourceIndex: index,
      availableTargets,
      itemDisplayNames,
      targetFormatNames,
      targetIndex: availableTargets.length > 0 ? 0 : -1
    });
  },

  // ---------- 选择目标格式 ----------
  selectTargetFormat(e) {
    const index = Number(e.currentTarget.dataset.index);
    this.setData({ targetIndex: index });
  },

  // ---------- 打开文件选择 ----------
  chooseFileAction() {
    if (this.data.sourceIndex === -1) {
      wx.showToast({ title: '请先选择源文件格式', icon: 'none' });
      return;
    }

    const sourceFormat = this.data.sourceFormats[this.data.sourceIndex];
    const allowedExt = this._getAllowedExtensions(sourceFormat); // 带点

    console.log('选择的源格式:', sourceFormat, '允许的扩展名:', allowedExt);

    wx.showActionSheet({
      itemList: ["从微信文件选择", "从文件管理器选择"],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.chooseFile(allowedExt);
        } else {
          this._chooseFromFileManager(allowedExt);
        }
      }
    });
  },

  // ---------- 微信文件选择 ----------
  chooseFile(allowedExt) {
    console.log('微信文件选择器 - 允许的扩展名:', allowedExt);
    wx.chooseMessageFile({
      count: 9,
      type: "file",
      extension: allowedExt,               // 严格限制
      success: (res) => {
        console.log('选择的文件:', res.tempFiles);
        this._processSelectedFiles(res.tempFiles);
      },
      fail: (err) => {
        console.error('文件选择失败:', err);
        wx.showToast({ title: '文件选择失败', icon: 'none' });
      }
    });
  },

  _chooseFromFileManager(allowedExt) {
    // 与 chooseFile 完全相同，只是 UI 文字不同
    this.chooseFile(allowedExt);
  },

  // ---------- 处理已选文件 ----------
  _processSelectedFiles(tempFiles) {
    const newFiles = [];
    let skipped = 0;   // 不符合格式的文件
    const sourceFormat = this.data.sourceFormats[this.data.sourceIndex];
    const allowedExt = this._getAllowedExtensions(sourceFormat);
  
    for (const file of tempFiles) {
      const extWithDot = this._getExt(file.name); // ".docx"
      
      // 严格验证：文件扩展名必须匹配选择的源格式
      if (!extWithDot || !allowedExt.includes(extWithDot)) {
        skipped++;
        console.warn(`文件格式不匹配: 选择的是${sourceFormat}格式，但文件是${extWithDot}格式`, file.name);
        continue;
      }
  
      newFiles.push({
        path: file.path,
        name: file.name,
        size: this._formatSize(file.size),
        status: "pending",
        taskId: undefined,
        downloadUrl: undefined,
        sourceFormat: sourceFormat, // 保存源格式信息
        fileExt: extWithDot // 保存文件实际扩展名
      });
    }
  
    this.setData({ fileList: [...this.data.fileList, ...newFiles] });
  
    if (skipped > 0) {
      wx.showToast({
        title: `已跳过 ${skipped} 个格式不匹配的文件`,
        icon: "none",
        duration: 3000
      });
    }
  },

  // ---------- 允许的扩展名（带点，严格匹配） ----------
  _getAllowedExtensions(sourceFormat) {
    const map = {
      pdf: [".pdf"],
      doc: [".doc"],          // 仅 .doc
      docx: [".docx"],        // 仅 .docx
      xls: [".xls"],
      xlsx: [".xlsx"],
      ppt: [".ppt"],
      pptx: [".pptx"],
      txt: [".txt"],
      rtf: [".rtf"],
      html: [".html", ".htm"]
    };
    return map[sourceFormat] || [];
  },

  // ---------- 提取扩展名（带点、小写） ----------
  _getExt(name) {
    if (!name) return '';
    const i = name.lastIndexOf('.');
    return i >= 0 ? name.slice(i).toLowerCase() : '';
  },

  // ---------- 开始转换 ----------
  async startConvert() {
    if (!this.data.fileList.length) return;
    if (this.data.sourceIndex === -1 || this.data.targetIndex === -1) {
      wx.showToast({ title: '请先选择源格式和目标格式', icon: 'none' });
      return;
    }

    this.setData({ converting: true, progress: 0, progressText: "准备转换..." });

    const total = this.data.fileList.filter(f => f.status === 'pending').length;
    let done = 0;

    for (let i = 0; i < this.data.fileList.length; i++) {
      const item = this.data.fileList[i];
      if (item.status !== "pending") continue;

      const next = [...this.data.fileList];
      next[i] = { ...item, status: "processing" };
      this.setData({ fileList: next });

      try {
        const target = this.data.availableTargets[this.data.targetIndex];
        const sourceFormat = this.data.sourceFormats[this.data.sourceIndex];
        
        const task = await this._uploadForConvert({
          filePath: item.path,
          targetFormat: target,
          category: "document",
          sourceFormat: sourceFormat // 传递选择的源格式
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

    this.setData({ converting: false });
    wx.showToast({ title: "批量转换完成", icon: "success" });
  },

  // ---------- 轮询任务 ----------
  async _pollTask(index, taskId) {
    const start = Date.now();
    const timeout = 5 * 60 * 1000;
    
    while (Date.now() - start < timeout) {
      try {
        const status = await this._queryTask(taskId);
        const elapsed = Date.now() - start;
        const smooth = Math.min(90, Math.max(5, Math.floor(elapsed / 1000) * 3));
        
        if (this.data.progress < smooth) {
          this.setData({ progress: smooth, progressText: `正在转换...` });
        }

        console.log('任务状态:', status); // 调试日志

        if (status.state === "finished") {
          // 优先使用 url（直接文件链接），如果没有则使用 downloadUrl
          const fileUrl = status.url || status.downloadUrl;
          if (fileUrl) {
            const next = [...this.data.fileList];
            next[index] = { 
              ...next[index], 
              status: "success", 
              downloadUrl: fileUrl, 
              taskId 
            };
            this.setData({ fileList: next });
            console.log('转换成功，文件链接:', fileUrl);
            return;
          } else {
            throw new Error("转换完成但缺少文件链接");
          }
        }
        
        if (status.state === "error") {
          throw new Error(status.message || "转换失败");
        }
        
        await new Promise(r => setTimeout(r, 1000)); // 改为1秒检查一次
      } catch (error) {
        console.error('轮询任务出错:', error);
        throw error;
      }
    }
    throw new Error("转换超时");
  },

  // ---------- 文件操作：预览、下载、分享 ----------

  // 预览文件
  previewFile(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.fileList[index];
    if (!item?.downloadUrl) {
      wx.showToast({ title: "文件尚未转换完成", icon: 'none' });
      return;
    }
    // 计算文件扩展名（用于错误信息）
    const fileExt = this._getExt(item.name || item.downloadUrl).toLowerCase();

    // 使用直接的文件 URL，先通过 _normalizeFileUrl 统一处理（包含 /download/->/public/ 和本地 host 替换）
    let fileUrl = this._normalizeFileUrl(item.downloadUrl);
    console.log('预览文件 URL (normalized):', fileUrl);

    wx.showLoading({ title: "加载中..." });
    
    wx.downloadFile({
      url: fileUrl,
      success: (res) => {
        wx.hideLoading();
        const tempPath = res.tempFilePath;
        
        wx.openDocument({
          filePath: tempPath,
          showMenu: true,
          success: () => {
            console.log("文档预览成功");
          },
          fail: (err) => {
            console.error("文档打开失败:", err);
            let errorMsg = "预览失败";
              if (err && err.errMsg && err.errMsg.includes('filetype not supported')) {
                errorMsg = `微信不支持预览 ${fileExt} 格式文件`;
              }
            wx.showToast({ title: errorMsg, icon: 'none', duration: 3000 });
          }
        });
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('预览下载失败:', err);
        wx.showToast({ title: "预览失败，请重试", icon: 'none' });
      }
    });
  },

  // 下载文件
  downloadFile(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.fileList[index];
    if (!item?.downloadUrl) {
      wx.showToast({ title: "文件尚未转换完成", icon: 'none' });
      return;
    }

    // 使用直接的文件 URL，先统一处理
    let fileUrl = this._normalizeFileUrl(item.downloadUrl);
    console.log('下载文件 URL (normalized):', fileUrl);

    wx.showLoading({ title: "下载中..." });
    
    wx.downloadFile({
      url: fileUrl,
      success: (res) => {
        wx.hideLoading();
        
        // 使用新的文件系统 API
        const fileManager = wx.getFileSystemManager();
        const tempPath = res.tempFilePath;
        
        // 生成保存路径
        const savePath = `${wx.env.USER_DATA_PATH}/${item.name || 'converted_file'}`;
        
        try {
          fileManager.saveFile({
            tempFilePath: tempPath,
            filePath: savePath,
            success: (saveRes) => {
              wx.showToast({ title: "下载成功", icon: 'success' });
              console.log('文件保存到:', saveRes.savedFilePath);
            },
            fail: (saveErr) => {
              console.error('保存文件失败:', saveErr);
              // 保存失败时尝试直接打开
              this._tryOpenDocument(tempPath, item.name);
            }
          });
        } catch (error) {
          console.error('文件保存异常:', error);
          this._tryOpenDocument(tempPath, item.name);
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('下载失败:', err);
        wx.showToast({ title: "下载失败", icon: 'none' });
      }
    });
  },

  // 尝试打开文档
  _tryOpenDocument(tempPath, fileName) {
    const ext = this._getExt(fileName).toLowerCase();
    const openableExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'];
    
    if (openableExts.includes(ext)) {
      wx.openDocument({
        filePath: tempPath,
        showMenu: true,
        success: () => {
          console.log("文档打开成功");
        },
        fail: (openErr) => {
          console.error("文档打开失败:", openErr);
          wx.showToast({ title: "文件已下载但无法打开", icon: 'none' });
        }
      });
    } else {
      wx.showToast({ 
        title: `文件已下载，请在文件管理中查看`, 
        icon: 'none',
        duration: 3000
      });
    }
  },

  // 分享文件
  shareFile(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.fileList[index];
    if (!item?.downloadUrl) {
      wx.showToast({ title: "文件尚未转换完成", icon: 'none' });
      return;
    }

    // 使用直接的文件 URL，先统一处理
    let fileUrl = this._normalizeFileUrl(item.downloadUrl);
    console.log('分享文件 URL (normalized):', fileUrl);

    wx.showLoading({ title: "准备分享..." });
    
    // 先下载文件
    wx.downloadFile({
      url: fileUrl,
      success: (res) => {
        wx.hideLoading();
        const tempPath = res.tempFilePath;
        
        if (wx.canIUse('shareFileMessage')) {
          // 使用文件分享
          wx.shareFileMessage({
            filePath: tempPath,
            success: () => {
              console.log("文件分享成功");
            },
            fail: (shareErr) => {
              console.error('文件分享失败:', shareErr);
              // 降级方案：复制链接
              this._copyLinkToClipboard(fileUrl);
            }
          });
        } else {
          // 降级方案：复制链接
          this._copyLinkToClipboard(fileUrl);
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('分享下载失败:', err);
        // 下载失败时直接复制链接
        this._copyLinkToClipboard(fileUrl);
      }
    });
  },

  // 复制链接到剪贴板
  _copyLinkToClipboard(url) {
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showToast({
          title: "链接已复制，可分享给好友",
          icon: "none"
        });
      },
      fail: () => {
        wx.showToast({
          title: "复制失败",
          icon: "none"
        });
      }
    });
  },

  // 删除文件
  removeFile(e) {
    const index = Number(e.currentTarget.dataset.index);
    const next = [...this.data.fileList];
    next.splice(index, 1);
    this.setData({ fileList: next });
  },

  // ---------- 云调用方法 ----------

  _uploadForConvert({ filePath, targetFormat, category, sourceFormat }) {
    return new Promise((resolve, reject) => {
      // 1. 先上传文件到云存储
      const cloudPath = `temp/${Date.now()}_${Math.random().toString(36).substr(2)}.${sourceFormat || 'file'}`;
      
      wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: filePath,
        success: (uploadRes) => {
          console.log('文件上传到云存储成功:', uploadRes);
            // 获取临时可下载 URL（cloud.uploadFile 返回的 fileID 不是公网可下载链接）
            console.log('上传后准备获取临时下载 URL, uploadRes.fileID=', uploadRes.fileID);
            wx.cloud.getTempFileURL({
              fileList: [{ fileID: uploadRes.fileID }],
              success: (tempRes) => {
                console.log('getTempFileURL 返回:', tempRes);
                const tempUrl = tempRes.fileList && tempRes.fileList[0] && tempRes.fileList[0].tempFileURL;
                if (!tempUrl) {
                  console.error('getTempFileURL 未返回 tempFileURL', tempRes);
                  return reject(new Error('无法获取临时下载 URL'));
                }
                console.log('临时下载 URL:', tempUrl);
                // 2. 调用云托管服务进行转换，传递可下载的临时 URL
                const postData = {
                  downloadUrl: tempUrl,
                  cloudPath: cloudPath,
                  category: category,
                  target: targetFormat,
                  source: sourceFormat
                };
                console.log('调用 /convert/upload，发送数据:', postData);
                wx.cloud.callContainer({
                  config: { env: "prod-2gyfay7ve535c92a" },
                  path: "/convert/upload",
                  header: { "X-WX-SERVICE": "convert", "content-type": "application/json" },
                  method: "POST",
                  data: postData,
                  success: (convertRes) => {
                    console.log("[转换任务创建成功]", convertRes);
                    if (convertRes.data && convertRes.data.taskId) {
                      resolve({ taskId: convertRes.data.taskId });
                    } else {
                      console.error('convert 返回但缺少 taskId', convertRes);
                      reject(new Error(convertRes.data?.message || "转换任务创建失败"));
                    }
                  },
                  fail: (convertErr) => {
                    console.error("[转换任务创建失败]", convertErr);
                    reject(new Error(convertErr.errMsg || "转换请求失败"));
                  }
                });
              },
              fail: (err) => {
                console.error('获取临时文件 URL 失败', err);
                reject(new Error('获取临时文件 URL 失败'));
              }
            });
        },
        fail: (uploadErr) => {
          console.error("[云存储上传失败]", uploadErr);
          reject(new Error(uploadErr.errMsg || "文件上传失败"));
        }
      });
    });
  },

  _queryTask(taskId) {
    return new Promise((resolve, reject) => {
      wx.cloud.callContainer({
        config: {
          env: "prod-2gyfay7ve535c92a"
        },
        path: `/convert/task/${taskId}`,
        header: {
          "X-WX-SERVICE": "convert"
        },
        method: "GET",
        success: (res) => {
          console.log('[任务查询响应]', res);
          if (res.data) {
            resolve(res.data);
          } else {
            reject(new Error("查询失败：响应数据为空"));
          }
        },
        fail: (err) => {
          console.error("[任务查询失败]", err);
          reject(new Error(err.errMsg || "查询请求失败"));
        }
      });
    });
  },

  // ---------- 辅助方法 ----------

  // 获取文件图标
  getFileIcon(filename) {
    const ext = this._getExt(filename).toLowerCase();
    const iconMap = {
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
      '.odp': '📋'
    };
    return iconMap[ext] || '📁';
  },

  // 检查是否支持预览（基于文件名）
  isPreviewSupported(filename) {
    const ext = this._getExt(filename).toLowerCase();
    const previewableExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'];
    return previewableExts.includes(ext);
  },

  // 检查目标文件是否支持预览
  isTargetPreviewSupported(fileItem) {
    if (!fileItem.downloadUrl) return false;
    
    // 从下载URL中提取文件扩展名来判断目标格式
    const targetExt = this._getExt(fileItem.downloadUrl).toLowerCase();
    const previewableExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'];
    return previewableExts.includes(targetExt);
  },

  // 规范化文件 URL：
  // 1) 将 /download/ 路径替换为 /public/（与后端生成的路径兼容）
  // 2) 如果 URL 指向 localhost 或 127.0.0.1，则使用配置的 PUBLIC_BASE_URL 替换主机部分（保留路径）
  _normalizeFileUrl(url) {
    if (!url) return url;
    let u = url;
    try {
      if (typeof u !== 'string') u = String(u);
      if (u.includes('/download/')) {
        u = u.replace('/download/', '/public/');
      }
      const localhostPattern = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i;
      if (localhostPattern.test(u) && PUBLIC_BASE_URL) {
        const base = PUBLIC_BASE_URL.replace(/\/$/, '');
        u = u.replace(localhostPattern, base);
        console.log('已将本地地址替换为 PUBLIC_BASE_URL:', u);
      }
    } catch (e) {
      console.warn('规范化文件 URL 失败，返回原始 URL', e);
    }
    return u;
  },

  // 获取格式显示名称
  _getFormatDisplayName(ext) {
    const formatMap = {
      '.txt': 'TXT 文本文件',
      '.html': 'HTML 网页文件',
      '.rtf': 'RTF 富文本文件',
      '.csv': 'CSV 表格文件',
      '.odt': 'ODT 文档',
      '.ods': 'ODS 表格',
      '.odp': 'ODP 演示文稿'
    };
    return formatMap[ext] || `${ext.toUpperCase()} 文件`;
  },

  _formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  },
});