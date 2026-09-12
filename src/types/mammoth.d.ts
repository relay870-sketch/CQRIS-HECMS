// mammoth 1.12.1 未在 package.json 声明 types 字段，这里补充最小类型声明
declare module 'mammoth' {
  export interface MammothMessage {
    type: string;
    message: string;
  }

  export interface MammothResult {
    value: string;
    messages: MammothMessage[];
  }

  export interface InputWithBuffer {
    buffer: Buffer;
  }

  export interface InputWithPath {
    path: string;
  }

  /** 文档中的图片资源 */
  export interface MammothImage {
    contentType: string;
    read(): Promise<Buffer>;
  }

  /** convertImage 回调的返回值 */
  export interface ConvertedImage {
    src: string;
    alt?: string;
  }

  export interface ConvertToHtmlOptions {
    convertImage?: (
      image: MammothImage
    ) => Promise<ConvertedImage> | ConvertedImage;
  }

  export function extractRawText(
    input: InputWithBuffer | InputWithPath
  ): Promise<MammothResult>;

  export function convertToHtml(
    input: (InputWithBuffer | InputWithPath) & ConvertToHtmlOptions
  ): Promise<MammothResult>;
}
