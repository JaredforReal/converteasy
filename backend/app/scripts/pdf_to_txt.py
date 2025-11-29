#!/usr/bin/env python3
import argparse
import pdfplumber
import sys
import os

def pdf_to_txt(pdf_path, txt_path):
    """将 PDF 转换为文本文件"""
    try:
        with pdfplumber.open(pdf_path) as pdf:
            text = ""
            for page in pdf.pages:
                text += page.extract_text() + "\n\n"
        
        with open(txt_path, 'w', encoding='utf-8') as f:
            f.write(text)
        
        print(f"转换成功: {pdf_path} -> {txt_path}")
        return True
    except Exception as e:
        print(f"转换失败: {str(e)}")
        return False

def main():
    parser = argparse.ArgumentParser(description='PDF 转文本文件')
    parser.add_argument('-i', '--input', required=True, help='输入 PDF 文件路径')
    parser.add_argument('-o', '--output', required=True, help='输出文本文件路径')
    
    args = parser.parse_args()
    
    if not os.path.exists(args.input):
        print(f"错误: 输入文件不存在 {args.input}")
        sys.exit(1)
    
    success = pdf_to_txt(args.input, args.output)
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()