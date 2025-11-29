#!/usr/bin/env python3
import argparse
from docx import Document
import sys
import os

def txt_to_word(txt_path, doc_path):
    """将文本文件转换为 Word 文档"""
    try:
        # 读取文本文件
        with open(txt_path, 'r', encoding='utf-8') as f:
            text_content = f.read()
        
        # 创建 Word 文档
        doc = Document()
        
        # 按行分割文本并添加到文档
        lines = text_content.split('\n')
        for line in lines:
            if line.strip():
                doc.add_paragraph(line.strip())
        
        doc.save(doc_path)
        print(f"转换成功: {txt_path} -> {doc_path}")
        return True
    except Exception as e:
        print(f"转换失败: {str(e)}")
        return False

def main():
    parser = argparse.ArgumentParser(description='文本转 Word')
    parser.add_argument('-i', '--input', required=True, help='输入文本文件路径')
    parser.add_argument('-o', '--output', required=True, help='输出 Word 文件路径')
    
    args = parser.parse_args()
    
    if not os.path.exists(args.input):
        print(f"错误: 输入文件不存在 {args.input}")
        sys.exit(1)
    
    success = txt_to_word(args.input, args.output)
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()