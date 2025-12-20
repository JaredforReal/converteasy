/**
 * api.js 单元测试
 * 测试 API 请求相关函数
 */

const { normalizeFileUrl, BASE_URL, getBaseUrl } = require('../utils/api');

// Mock wx 对象
global.wx = {
  request: jest.fn(),
  uploadFile: jest.fn(),
  downloadFile: jest.fn(),

  getAccountInfoSync: jest.fn(() => ({
    miniProgram: {
      envVersion: 'develop' 
    }
  }))
  
};

// Mock getApp
global.getApp = jest.fn();

describe('BASE_URL', () => {
  test('应该是正式域名', () => {
    expect(BASE_URL).toBe('https://convertease.site');
  });
});

describe('getBaseUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('无 globalData 时应返回默认 BASE_URL', () => {
    global.getApp.mockReturnValue(null);
    expect(getBaseUrl()).toBe(BASE_URL);
  });

  test('globalData 为空时应返回默认 BASE_URL', () => {
    global.getApp.mockReturnValue({});
    expect(getBaseUrl()).toBe(BASE_URL);
  });

  test('globalData.apiBaseUrl 未设置时应返回默认 BASE_URL', () => {
    global.getApp.mockReturnValue({ globalData: {} });
    expect(getBaseUrl()).toBe(BASE_URL);
  });

  test('应返回 globalData.apiBaseUrl 并移除尾部斜杠', () => {
    global.getApp.mockReturnValue({
      globalData: { apiBaseUrl: 'https://custom.api.com/' }
    });
    expect(getBaseUrl()).toBe('https://custom.api.com');
  });

  test('无尾部斜杠的 apiBaseUrl 应保持不变', () => {
    global.getApp.mockReturnValue({
      globalData: { apiBaseUrl: 'https://custom.api.com' }
    });
    expect(getBaseUrl()).toBe('https://custom.api.com');
  });
});

describe('normalizeFileUrl', () => {
  test('应将 /download/ 替换为 /public/', () => {
    const url = 'https://convertease.site/download/file.pdf';
    expect(normalizeFileUrl(url)).toBe('https://convertease.site/public/file.pdf');
  });

  test('应将 localhost 替换为正式域名', () => {
    const url = 'http://localhost:8000/public/file.pdf';
    const normalized = normalizeFileUrl(url);
    expect(normalized).toBe('https://convertease.site/public/file.pdf');
  });

  test('应将 127.0.0.1 替换为正式域名', () => {
    const url = 'http://127.0.0.1:8000/public/file.pdf';
    const normalized = normalizeFileUrl(url);
    expect(normalized).toBe('https://convertease.site/public/file.pdf');
  });

  test('应同时处理 /download/ 和 localhost', () => {
    const url = 'http://localhost:8000/download/file.pdf';
    const normalized = normalizeFileUrl(url);
    expect(normalized).toBe('https://convertease.site/public/file.pdf');
  });

  test('空值应返回原值', () => {
    expect(normalizeFileUrl(null)).toBe(null);
    expect(normalizeFileUrl(undefined)).toBe(undefined);
    expect(normalizeFileUrl('')).toBe('');
  });

  test('不包含特殊路径的 URL 应保持不变', () => {
    const url = 'https://convertease.site/public/file.pdf';
    expect(normalizeFileUrl(url)).toBe(url);
  });

  test('应处理带端口的 localhost', () => {
    const url = 'http://localhost:3000/api/file.pdf';
    const normalized = normalizeFileUrl(url);
    expect(normalized).toBe('https://convertease.site/api/file.pdf');
  });

  test('应处理不带端口的 localhost', () => {
    const url = 'http://localhost/api/file.pdf';
    const normalized = normalizeFileUrl(url);
    expect(normalized).toBe('https://convertease.site/api/file.pdf');
  });

  test('应处理 https 的 localhost', () => {
    const url = 'https://localhost:8443/api/file.pdf';
    const normalized = normalizeFileUrl(url);
    expect(normalized).toBe('https://convertease.site/api/file.pdf');
  });
});

describe('httpRequest', () => {
  const { httpRequest } = require('../utils/api');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('成功请求应 resolve 响应数据', async () => {
    const mockData = { status: 'ok', data: 'test' };
    global.wx.request.mockImplementation((options) => {
      options.success({ statusCode: 200, data: mockData });
    });

    const result = await httpRequest('https://api.test.com/endpoint', 'GET');
    expect(result).toEqual(mockData);
    expect(global.wx.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.test.com/endpoint',
        method: 'GET'
      })
    );
  });

  test('POST 请求应包含请求数据', async () => {
    const requestData = { name: 'test' };
    const mockResponse = { success: true };
    global.wx.request.mockImplementation((options) => {
      options.success({ statusCode: 200, data: mockResponse });
    });

    const result = await httpRequest('https://api.test.com/endpoint', 'POST', requestData);
    expect(result).toEqual(mockResponse);
    expect(global.wx.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.test.com/endpoint',
        method: 'POST',
        data: requestData
      })
    );
  });

  test('非 2xx 状态码应 reject', async () => {
    global.wx.request.mockImplementation((options) => {
      options.success({ statusCode: 404, data: { message: 'Not Found' } });
    });

    await expect(httpRequest('https://api.test.com/endpoint'))
      .rejects.toThrow('Not Found');
  });

  test('请求失败应 reject', async () => {
    global.wx.request.mockImplementation((options) => {
      options.fail({ errMsg: 'network error' });
    });

    await expect(httpRequest('https://api.test.com/endpoint'))
      .rejects.toThrow('network error');
  });

  test('空响应数据应返回空对象', async () => {
    global.wx.request.mockImplementation((options) => {
      options.success({ statusCode: 200, data: null });
    });

    const result = await httpRequest('https://api.test.com/endpoint');
    expect(result).toEqual({});
  });
});

describe('httpUploadFile', () => {
  const { httpUploadFile } = require('../utils/api');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('成功上传应返回 taskId', async () => {
    const mockResponse = { taskId: 'task123' };
    global.wx.uploadFile.mockImplementation((options) => {
      options.success({
        statusCode: 200,
        data: JSON.stringify(mockResponse)
      });
    });

    const result = await httpUploadFile(
      'https://api.test.com/upload',
      '/path/to/file.pdf',
      { target: 'docx' }
    );

    expect(result).toEqual({ taskId: 'task123' });
    expect(global.wx.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.test.com/upload',
        filePath: '/path/to/file.pdf',
        name: 'file',
        formData: { target: 'docx' }
      })
    );
  });

  test('上传失败应 reject', async () => {
    global.wx.uploadFile.mockImplementation((options) => {
      options.fail({ errMsg: 'upload failed' });
    });

    await expect(httpUploadFile(
      'https://api.test.com/upload',
      '/path/to/file.pdf',
      {}
    )).rejects.toThrow('upload failed');
  });

  test('响应缺少 taskId 应 reject', async () => {
    global.wx.uploadFile.mockImplementation((options) => {
      options.success({
        statusCode: 200,
        data: JSON.stringify({ success: true })
      });
    });

    await expect(httpUploadFile(
      'https://api.test.com/upload',
      '/path/to/file.pdf',
      {}
    )).rejects.toThrow();
  });

  test('非 2xx 状态码应 reject', async () => {
    global.wx.uploadFile.mockImplementation((options) => {
      options.success({
        statusCode: 500,
        data: JSON.stringify({ message: 'Server Error' })
      });
    });

    await expect(httpUploadFile(
      'https://api.test.com/upload',
      '/path/to/file.pdf',
      {}
    )).rejects.toThrow('Server Error');
  });
});

describe('queryTask', () => {
  const { queryTask } = require('../utils/api');

  beforeEach(() => {
    jest.clearAllMocks();
    global.getApp.mockReturnValue(null);
  });

  test('应正确构造查询 URL', async () => {
    global.wx.request.mockImplementation((options) => {
      options.success({ statusCode: 200, data: { state: 'pending' } });
    });

    await queryTask('task123');

    expect(global.wx.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://convertease.site/convert/task/task123',
        method: 'GET'
      })
    );
  });

  test('应返回任务状态', async () => {
    const taskStatus = { state: 'finished', url: 'https://convertease.site/public/result.pdf' };
    global.wx.request.mockImplementation((options) => {
      options.success({ statusCode: 200, data: taskStatus });
    });

    const result = await queryTask('task123');
    expect(result).toEqual(taskStatus);
  });
});
