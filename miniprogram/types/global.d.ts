declare namespace WechatMiniprogram {
  interface UploadFileSuccessCallbackResult {
    statusCode: number;
    data: string;
  }

  interface Wx {
    uploadFile(options: {
      url: string;
      filePath: string;
      name: string;
      formData?: Record<string, string>;
      success?: (res: UploadFileSuccessCallbackResult) => void;
      fail?: (err: GeneralCallbackResult) => void;
    }): void;

    request<T = unknown>(options: {
      url: string;
      method?: "GET" | "POST" | "PUT" | "DELETE" | "OPTIONS" | "HEAD" | "PATCH";
      data?: unknown;
      header?: Record<string, string>;
      success?: (res: RequestSuccessCallbackResult<T>) => void;
      fail?: (err: GeneralCallbackResult) => void;
    }): void;

    chooseMessageFile(options: {
      count?: number;
      type?: "all" | "video" | "image" | "file";
      extension?: string[];
      success?: (res: { tempFiles: Array<{ name: string; path: string; size: number }> }) => void;
      fail?: (err: GeneralCallbackResult) => void;
    }): void;

    showToast(options: { title: string; icon?: "success" | "loading" | "none"; duration?: number }): void;

    downloadFile(options: {
      url: string;
      success?: (res: { tempFilePath: string }) => void;
      fail?: (err: GeneralCallbackResult) => void;
    }): void;

    openDocument(options: {
      filePath: string;
      showMenu?: boolean;
      success?: () => void;
      fail?: () => void;
    }): void;

    saveFile(options: {
      tempFilePath: string;
      success?: (res: { savedFilePath: string }) => void;
      fail?: (err: GeneralCallbackResult) => void;
      complete?: () => void;
    }): void;

    showLoading(options: { title: string; mask?: boolean }): void;
    hideLoading(): void;

    showActionSheet(options: {
      itemList: string[];
      success?: (res: { tapIndex: number }) => void;
      fail?: (err: GeneralCallbackResult) => void;
    }): void;

    setClipboardData(options: {
      data: string;
      success?: () => void;
      fail?: (err: GeneralCallbackResult) => void;
    }): void;

    createInnerAudioContext(): {
      src: string;
      play(): void;
      pause(): void;
      stop(): void;
      destroy(): void;
      onEnded(callback: () => void): void;
      onError(callback: (err: GeneralCallbackResult) => void): void;
    };

    canIUse(method: string): boolean;

    shareFileMessage(options: {
      filePath: string;
      success?: () => void;
      fail?: (err: GeneralCallbackResult) => void;
    }): void;
  }
}