#!/usr/bin/env python3
import argparse
import pandas as pd
import sys
import os

def txt_to_xls(txt_path, xls_path):
    """将文本文件转换为 Excel 文件"""
    try:
        # 读取文本文件
        with open(txt_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        # 处理文本数据（假设是表格数据，用制表符或逗号分隔）
        data = []
        for line in lines:
            line = line.strip()
            if line:
                # 尝试用制表符分割，如果没有则用逗号
                if '\t' in line:
                    row = line.split('\t')
                else:
                    row = line.split(',')
                data.append(row)
        
        # 创建 DataFrame
        if len(data) > 1:
            df = pd.DataFrame(data[1:], columns=data[0] if data else None)
        else:
            df = pd.DataFrame(data)
        
        # 保存为 Excel
        df.to_excel(xls_path, index=False)
        print(f"转换成功: {txt_path} -> {xls_path}")
        return True
    except Exception as e:
        print(f"转换失败: {str(e)}")
        return False

def main():
    parser = argparse.ArgumentParser(description='文本转 Excel')
    parser.add_argument('-i', '--input', required=True, help='输入文本文件路径')
    parser.add_argument('-o', '--output', required=True, help='输出 Excel 文件路径')
    
    args = parser.parse_args()
    
    if not os.path.exists(args.input):
        print(f"错误: 输入文件不存在 {args.input}")
        sys.exit(1)
    
    success = txt_to_xls(args.input, args.output)
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()