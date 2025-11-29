#!/usr/bin/env python3
import argparse
import pandas as pd
import sys
import os

def xls_to_txt(xls_path, txt_path):
    """将 Excel 文件转换为文本文件"""
    try:
        # 读取 Excel 文件
        df = pd.read_excel(xls_path)
        
        # 转换为文本格式
        text_content = ""
        
        # 添加表头
        text_content += "\t".join(df.columns.astype(str)) + "\n"
        
        # 添加数据行
        for _, row in df.iterrows():
            text_content += "\t".join(row.astype(str)) + "\n"
        
        with open(txt_path, 'w', encoding='utf-8') as f:
            f.write(text_content)
        
        print(f"转换成功: {xls_path} -> {txt_path}")
        return True
    except Exception as e:
        print(f"转换失败: {str(e)}")
        return False

def main():
    parser = argparse.ArgumentParser(description='Excel 转文本')
    parser.add_argument('-i', '--input', required=True, help='输入 Excel 文件路径')
    parser.add_argument('-o', '--output', required=True, help='输出文本文件路径')
    
    args = parser.parse_args()
    
    if not os.path.exists(args.input):
        print(f"错误: 输入文件不存在 {args.input}")
        sys.exit(1)
    
    success = xls_to_txt(args.input, args.output)
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()