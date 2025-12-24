import argparse
import sys
import os
import traceback
import time
from md2pdf.core import md2pdf

def convert_md_to_pdf(input_file, output_file):
    """Converts a Markdown file to a PDF file using md2pdf."""
    try:
        print(f"[INFO] 开始转换: {input_file} -> {output_file}")
        start_time = time.time()

        md2pdf(output_file, md_file_path=input_file)

        elapsed = time.time() - start_time
        print(f"[SUCCESS] 转换成功: {input_file} -> {output_file}")
        print(f"[INFO] 总耗时: {elapsed:.1f} 秒")
        return True
    except Exception as e:
        print(f"[ERROR] md2pdf 转换失败: {str(e)}", file=sys.stderr)
        traceback.print_exc()
        return False

def main():
    parser = argparse.ArgumentParser(description="Markdown 转 PDF")
    parser.add_argument("-i", "--input", required=True, help="输入 Markdown 文件路径")
    parser.add_argument("-o", "--output", required=True, help="输出 PDF 文件路径")

    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"[ERROR] 输入文件不存在: {args.input}", file=sys.stderr)
        sys.exit(1)

    print(f"[INFO] 输入文件: {args.input}")
    print(f"[INFO] 输出文件: {args.output}")

    success = convert_md_to_pdf(args.input, args.output)

    if success:
        if os.path.exists(args.output) and os.path.getsize(args.output) > 0:
            print(f"[SUCCESS] 最终转换成功，输出文件大小: {os.path.getsize(args.output)} 字节")
            sys.exit(0)
        else:
            print("[ERROR] 输出文件创建失败或为空", file=sys.stderr)
            sys.exit(1)
    else:
        print("[ERROR] 转换方法失败", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
