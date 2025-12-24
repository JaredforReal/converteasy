/**
 * API 请求模块
 * 纯 HTTP 请求方式，无云调用依赖
 */

const { sleep } = require('./common');

// 正式域名
const BASE_URL = 'https://convertease.site';

/**
 * 获取 API 基础地址
 * @returns {string}
 */
function getBaseUrl() {
  const app = getApp();
  if (app && app.globalData && app.globalData.apiBaseUrl) {
    return app.globalData.apiBaseUrl.replace(/\/$/, '');
  }
  return BASE_URL;
}

/**
 * 规范化文件 URL
 * 强制将 /download/ 路径替换为 /public/，并将 localhost 替换为线上域名
 * @param {string} url - 原始 URL
 * @returns {string} 规范化后的 URL
 */
function normalizeFileUrl(url) {
  if (!url) return url;
  let u = url;
  try {
    if (typeof u !== 'string') u = String(u);

    // 1. 替换下载路径
    if (u.includes('/download/')) {
      u = u.replace('/download/', '/public/');
    }

    // 2. 强制替换本地地址 (不进行环境判断，无条件替换)
    const localhostPattern = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i;
    if (localhostPattern.test(u)) {
      const base = BASE_URL.replace(/\/$/, '');
      u = u.replace(localhostPattern, base);
      console.log('已将本地地址替换为正式域名:', u);
    }

  } catch (e) {
    console.warn('规范化文件 URL 失败，返回原始 URL', e);
  }
  return u;
}

/**
 * HTTP 请求
 * @param {string} url - 完整 URL
 * @param {string} method - 请求方法
 * @param {object} data - 请求数据
 * @returns {Promise<any>}
 */
function httpRequest(url, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      url,
      method,
      header: {
        'content-type': 'application/json'
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data || {});
        } else {
          const raw = typeof res.data === 'string' ? res.data.slice(0, 200) : JSON.stringify(res.data);
          reject(new Error((res.data?.message) || `请求失败(${res.statusCode}) ${raw}`));
        }
      },
      fail: (err) => {
        console.error('[httpRequest fail]', err);
        reject(new Error(err.errMsg || '请求失败'));
      }
    };

    if (data) {
      options.data = data;
    }

    wx.request(options);
  });
}

/**
 * HTTP 上传文件
 * @param {string} url - 上传地址
 * @param {string} filePath - 本地文件路径
 * @param {object} formData - 表单数据
 * @returns {Promise<{taskId: string}>}
 */
function httpUploadFile(url, filePath, formData) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url,
      filePath,
      name: 'file',
      formData,
      success: (res) => {
        try {
          console.log('[uploadFile] status=', res.statusCode, 'data=', res.data);
          const data = JSON.parse(res.data || '{}');
          if (res.statusCode >= 200 && res.statusCode < 300 && data.taskId) {
            resolve({ taskId: data.taskId });
          } else {
            const raw = typeof res.data === 'string' ? res.data.slice(0, 200) : JSON.stringify(res.data);
            reject(new Error((data && data.message) || `上传失败(${res.statusCode}) ${raw}`));
          }
        } catch (e) {
          const snippet = (res && typeof res.data === 'string') ? res.data.slice(0, 200) : '';
          reject(new Error('响应解析失败 ' + snippet));
        }
      },
      fail: (err) => {
        console.error('[uploadFile fail]', err);
        reject(new Error(err.errMsg || '上传请求失败'));
      }
    });
  });
}

/**
 * 创建文档转换任务
 * @param {object} params - 转换参数
 * @param {string} params.filePath - 本地文件路径
 * @param {string} params.targetFormat - 目标格式
 * @param {string} params.sourceFormat - 源格式
 * @returns {Promise<{taskId: string}>}
 */
function createDocumentConvertTask({ filePath, targetFormat, sourceFormat }) {
  const url = `${getBaseUrl()}/convert/upload`;
  return httpUploadFile(url, filePath, {
    category: 'document',
    target: targetFormat,
    source: sourceFormat
  });
}

/**
 * 创建音频转换任务
 * @param {object} params - 转换参数
 * @param {string} params.filePath - 本地文件路径
 * @param {string} params.targetFormat - 目标格式
 * @returns {Promise<{taskId: string}>}
 */
function createAudioConvertTask({ filePath, targetFormat }) {
  const url = `${getBaseUrl()}/convert/upload`;
  return httpUploadFile(url, filePath, {
    category: 'audio',
    target: targetFormat
  });
}

/**
 * 查询转换任务状态
 * @param {string} taskId - 任务 ID
 * @returns {Promise<{state: string, url?: string, message?: string}>}
 */
function queryTask(taskId) {
  const url = `${getBaseUrl()}/convert/task/${taskId}`;
  return httpRequest(url, 'GET');
}

/**
 * 轮询任务状态直到完成
 * @param {string} taskId - 任务 ID
 * @param {function} queryFn - 查询函数
 * @param {function} onProgress - 进度回调
 * @param {number} timeout - 超时时间（毫秒）
 * @param {number} interval - 轮询间隔（毫秒）
 * @returns {Promise<{url: string}>}
 */
async function pollTaskUntilComplete(taskId, queryFn, onProgress, timeout = 5 * 60 * 1000, interval = 1000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const status = await queryFn(taskId);
    const elapsed = Date.now() - start;
    const progress = Math.min(90, Math.max(5, Math.floor(elapsed / 1000) * 3));

    if (onProgress) {
      onProgress(progress);
    }

    console.log('任务状态:', status);

    if (status.state === 'finished') {
      const fileUrl = status.url || status.downloadUrl;
      if (fileUrl) {
        console.log('转换成功，文件链接:', fileUrl);
        return { url: fileUrl };
      } else {
        throw new Error('转换完成但缺少文件链接');
      }
    }

    if (status.state === 'error') {
      throw new Error(status.message || '转换失败');
    }

    await sleep(interval);
  }

  throw new Error('转换超时');
}

/**
 * 加载支持的格式
 * @param {string} category - 分类 'document' | 'audio'
 * @returns {Promise<object>}
 */
function loadSupportedFormats(category) {
  const url = `${getBaseUrl()}/supported-formats?category=${category}`;
  return httpRequest(url, 'GET');
}

/**
 * 健康检查
 * @returns {Promise<object>}
 */
function healthCheck() {
  const url = `${getBaseUrl()}/health`;
  return httpRequest(url, 'GET');
}

module.exports = {
  BASE_URL,
  getBaseUrl,
  normalizeFileUrl,
  httpRequest,
  httpUploadFile,
  createDocumentConvertTask,
  createAudioConvertTask,
  queryTask,
  pollTaskUntilComplete,
  loadSupportedFormats,
  healthCheck
};
