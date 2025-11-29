type UploadForConvertParams = {
  filePath: string;
  targetFormat: string;
  category: "document" | "audio";
};

type TaskResponse = {
  taskId: string;
};

type TaskStatus = {
  state: "queued" | "processing" | "finished" | "error";
  url?: string;
  message?: string;
};

const getBaseUrl = (): string => {
  const app = getApp<{ globalData: { apiBaseUrl: string } }>();
  const baseUrl = app?.globalData?.apiBaseUrl || "";
  if (!baseUrl) {
    return "";
  }
  return baseUrl.replace(/\/$/, ""); // 去除结尾斜杠
};

export async function uploadForConvert(params: UploadForConvertParams): Promise<TaskResponse> {
  const url = `${getBaseUrl()}/convert/upload`;
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url,
      filePath: params.filePath,
      name: "file",
      formData: {
        category: params.category,
        target: params.targetFormat,
      },
      success: (res) => {
        try {
          const data = JSON.parse(res.data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ taskId: data.taskId });
          } else {
            reject(new Error(data.message || `上传失败(${res.statusCode})`));
          }
        } catch (e: any) {
          reject(new Error("响应解析失败"));
        }
      },
      fail: (err) => reject(err),
    });
  });
}

export async function queryTask(taskId: string): Promise<TaskStatus> {
  const url = `${getBaseUrl()}/convert/task/${taskId}`;
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: "GET",
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data as TaskStatus);
        } else {
          reject(new Error((res.data as any)?.message || `查询失败(${res.statusCode})`));
        }
      },
      fail: (err) => reject(err),
    });
  });
}

export async function downloadFileToAlbum(fileUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let downloadUrl = fileUrl;
    if (fileUrl.startsWith("/")) {
      const baseUrl = getBaseUrl();
      downloadUrl = baseUrl + fileUrl;
    }
    
    console.log("下载文件:", downloadUrl);
    
    wx.downloadFile({
      url: downloadUrl,
      success: (res) => {
        if (!res.tempFilePath) {
          reject(new Error("下载失败，未获取到临时文件路径"));
          return;
        }
        
        const tempPath = res.tempFilePath;
        console.log("文件下载到临时路径:", tempPath);
        
        // 直接打开文档预览
        wx.openDocument({
          filePath: tempPath,
          showMenu: true, // 显示菜单，用户可以选择保存到本地
          success: () => {
            console.log("文档打开成功");
            resolve();
          },
          fail: (openErr) => {
            console.warn("文档打开失败:", openErr);
            // 对于不支持预览的文件类型，提示用户
            wx.showToast({
              title: "文件已下载，请在文件管理中查看",
              icon: "success"
            });
            resolve();
          },
        });
      },
      fail: (e) => {
        console.error("下载文件失败:", e);
        reject(new Error("下载失败，请检查网络连接"));
      },
    });
  });
}