/**
 * 集成测试
 * 测试组件之间的交互和完整流程
 */

// Mock wx 对象
global.wx = {
  request: jest.fn(),
  uploadFile: jest.fn(),
  downloadFile: jest.fn(),
  openDocument: jest.fn(),
  shareFileMessage: jest.fn(),
  setClipboardData: jest.fn(),
  showToast: jest.fn(),
  showLoading: jest.fn(),
  hideLoading: jest.fn(),
  chooseMessageFile: jest.fn(),
  getFileSystemManager: jest.fn(() => ({
    saveFile: jest.fn()
  })),
  canIUse: jest.fn(() => true),
  env: {
    USER_DATA_PATH: '/wxfile/user'
  },

  getAccountInfoSync: jest.fn(() => ({
    miniProgram: {
      envVersion: 'develop' // 模拟开发环境，允许 localhost
    }
  })),

};

// Mock getApp
global.getApp = jest.fn().mockReturnValue(null);

const { createDocumentConvertTask, createAudioConvertTask, queryTask, pollTaskUntilComplete, normalizeFileUrl } = require('../utils/api');
const { chooseMessageFile, downloadFile, isPreviewSupported } = require('../utils/file');
const { getAllowedExtensions, getFormatDisplayName, DOCUMENT_CONVERSION_MAP, AUDIO_CONVERSION_MAP } = require('../utils/formats');
const { formatSize, getExt } = require('../utils/common');

describe('文档转换流程集成测试', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.getApp.mockReturnValue(null);
  });

  describe('文件选择 -> 获取扩展名 -> 验证格式', () => {
    test('应正确处理 PDF 文件选择和格式验证', async () => {
      const mockFile = {
        path: '/tmp/document.pdf',
        name: 'document.pdf',
        size: 1024 * 1024
      };

      global.wx.chooseMessageFile.mockImplementation((options) => {
        options.success({ tempFiles: [mockFile] });
      });

      // 1. 获取 PDF 格式允许的扩展名
      const allowedExt = getAllowedExtensions('document', 'pdf');
      expect(allowedExt).toContain('.pdf');

      // 2. 选择文件
      const files = await chooseMessageFile(allowedExt);
      expect(files).toHaveLength(1);

      // 3. 验证文件扩展名
      const fileExt = getExt(files[0].name);
      expect(fileExt).toBe('.pdf');
      expect(allowedExt.map(e => e.toLowerCase())).toContain(fileExt);

      // 4. 获取可转换的目标格式
      const targetFormats = DOCUMENT_CONVERSION_MAP['pdf'];
      expect(targetFormats).toContain('doc');
      expect(targetFormats).toContain('docx');

      // 5. 获取格式显示名称
      const displayName = getFormatDisplayName('document', 'pdf');
      expect(displayName).toBe('PDF');

      // 6. 格式化文件大小
      const sizeStr = formatSize(mockFile.size);
      expect(sizeStr).toBe('1.0 MB');
    });
  });

  describe('创建转换任务 -> 轮询状态 -> 获取结果', () => {
    test('应完成完整的文档转换流程', async () => {
      const taskId = 'task_doc_12345';
      const resultUrl = 'http://localhost:8000/download/result.docx';

      // Mock 上传文件
      global.wx.uploadFile.mockImplementation((options) => {
        options.success({
          statusCode: 200,
          data: JSON.stringify({ taskId })
        });
      });

      // Mock 查询任务状态
      let queryCount = 0;
      global.wx.request.mockImplementation((options) => {
        queryCount++;
        if (queryCount < 3) {
          options.success({
            statusCode: 200,
            data: { state: 'processing' }
          });
        } else {
          options.success({
            statusCode: 200,
            data: { state: 'finished', url: resultUrl }
          });
        }
      });

      // 1. 创建转换任务
      const uploadResult = await createDocumentConvertTask({
        filePath: '/tmp/document.pdf',
        targetFormat: 'docx',
        sourceFormat: 'pdf'
      });
      expect(uploadResult.taskId).toBe(taskId);

      // 2. 轮询任务状态
      const progressUpdates = [];
      const result = await pollTaskUntilComplete(
        taskId,
        queryTask,
        (progress) => progressUpdates.push(progress),
        10000,
        10 // 短轮询间隔加速测试
      );

      // 3. 验证结果
      expect(progressUpdates.length).toBeGreaterThan(0);

      // 4. URL 规范化
      const normalizedUrl = normalizeFileUrl(result.url);
      expect(normalizedUrl).toContain('/public/');
      expect(normalizedUrl).not.toContain('localhost');
    });

    test('转换错误应正确处理', async () => {
      const taskId = 'task_doc_error';

      global.wx.uploadFile.mockImplementation((options) => {
        options.success({
          statusCode: 200,
          data: JSON.stringify({ taskId })
        });
      });

      global.wx.request.mockImplementation((options) => {
        options.success({
          statusCode: 200,
          data: { state: 'error', message: '转换失败：不支持的格式' }
        });
      });

      await expect(pollTaskUntilComplete(
        taskId,
        queryTask,
        null,
        10000,
        10
      )).rejects.toThrow('转换失败');
    });
  });

  describe('下载结果 -> 预览/保存', () => {
    test('应正确下载并判断是否可预览', async () => {
      const resultUrl = 'https://convertease.site/public/result.docx';
      const tempPath = '/tmp/result.docx';

      global.wx.downloadFile.mockImplementation((options) => {
        options.success({ tempFilePath: tempPath });
      });

      // 1. 下载文件
      const downloadedPath = await downloadFile(resultUrl);
      expect(downloadedPath).toBe(tempPath);

      // 2. 检查是否可预览
      expect(isPreviewSupported('result.docx')).toBe(true);
      expect(isPreviewSupported('result.pdf')).toBe(true);
      expect(isPreviewSupported('result.txt')).toBe(false);
    });
  });
});

describe('音频转换流程集成测试', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.getApp.mockReturnValue(null);
  });

  test('应完成完整的音频转换流程', async () => {
    const taskId = 'task_audio_12345';
    const resultUrl = 'https://convertease.site/public/result.wav';

    // 1. 验证格式配置
    const allowedExt = getAllowedExtensions('audio', 'mp3');
    expect(allowedExt).toContain('.mp3');

    const targetFormats = AUDIO_CONVERSION_MAP['mp3'];
    expect(targetFormats).toContain('wav');

    // Mock 上传
    global.wx.uploadFile.mockImplementation((options) => {
      options.success({
        statusCode: 200,
        data: JSON.stringify({ taskId })
      });
    });

    // Mock 查询（直接返回完成）
    global.wx.request.mockImplementation((options) => {
      options.success({
        statusCode: 200,
        data: { state: 'finished', url: resultUrl }
      });
    });

    // 2. 创建音频转换任务
    const uploadResult = await createAudioConvertTask({
      filePath: '/tmp/audio.mp3',
      targetFormat: 'wav'
    });
    expect(uploadResult.taskId).toBe(taskId);

    // 3. 查询任务状态
    const status = await queryTask(taskId);
    expect(status.state).toBe('finished');
    expect(status.url).toBe(resultUrl);

    // 4. 验证格式显示名称
    expect(getFormatDisplayName('audio', 'mp3')).toBe('MP3');
    expect(getFormatDisplayName('audio', 'wav')).toBe('WAV');
  });
});

describe('错误处理集成测试', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.getApp.mockReturnValue(null);
  });

  test('网络错误应正确传播', async () => {
    global.wx.uploadFile.mockImplementation((options) => {
      options.fail({ errMsg: 'request:fail timeout' });
    });

    await expect(createDocumentConvertTask({
      filePath: '/tmp/document.pdf',
      targetFormat: 'docx',
      sourceFormat: 'pdf'
    })).rejects.toThrow('timeout');
  });

  test('服务器错误应正确处理', async () => {
    global.wx.uploadFile.mockImplementation((options) => {
      options.success({
        statusCode: 500,
        data: JSON.stringify({ message: 'Internal Server Error' })
      });
    });

    await expect(createDocumentConvertTask({
      filePath: '/tmp/document.pdf',
      targetFormat: 'docx',
      sourceFormat: 'pdf'
    })).rejects.toThrow('Internal Server Error');
  });

  test('文件选择取消应正确处理', async () => {
    global.wx.chooseMessageFile.mockImplementation((options) => {
      options.fail({ errMsg: 'chooseMessageFile:fail cancel' });
    });

    await expect(chooseMessageFile(['pdf']))
      .rejects.toEqual({ errMsg: 'chooseMessageFile:fail cancel' });
  });
});

describe('边界情况测试', () => {
  test('空文件名扩展名提取', () => {
    expect(getExt('')).toBe('');
    expect(getExt(null)).toBe('');
    expect(getExt(undefined)).toBe('');
  });

  test('特殊文件名处理', () => {
    expect(getExt('file.backup.2024.pdf')).toBe('.pdf');
    expect(getExt('中文文件.docx')).toBe('.docx');
    expect(getExt('file with spaces.xlsx')).toBe('.xlsx');
  });

  test('URL 规范化边界情况', () => {
    expect(normalizeFileUrl(null)).toBe(null);
    expect(normalizeFileUrl(undefined)).toBe(undefined);
    expect(normalizeFileUrl('')).toBe('');

    // 多次替换不应叠加
    const url = 'http://localhost:8000/download/file.pdf';
    const normalized = normalizeFileUrl(url);
    const doubleNormalized = normalizeFileUrl(normalized);
    expect(normalized).toBe(doubleNormalized);
  });

  test('文件大小格式化边界值', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(1)).toBe('1 B');
    expect(formatSize(1023)).toBe('1023 B');
    expect(formatSize(1024)).toBe('1.0 KB');
    expect(formatSize(1024 * 1024 - 1)).toBe('1024.0 KB');
    expect(formatSize(1024 * 1024)).toBe('1.0 MB');
  });
});
