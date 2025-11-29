#!/usr/bin/env python3
import argparse
import pdfplumber
import pandas as pd
import sys
import os

def pdf_to_xls(pdf_path, xls_path):
    """将 PDF 表格转换为 Excel 文件"""
    try:
        tables = []
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                # 提取页面中的表格
                page_tables = page.extract_tables()
                for table in page_tables:
                    if table and len(table) > 1:  # 确保表格有数据
                        tables.append(table)
        
        if not tables:
            print("警告: 未在 PDF 中找到表格数据")
            # 创建一个空的 Excel 文件
            df = pd.DataFrame()
            df.to_excel(xls_path, index=False)
        else:
            # 将第一个表格保存为 Excel
            df = pd.DataFrame(tables[0][1:], columns=tables[0][0])
            df.to_excel(xls_path, index=False)
        
        print(f"转换成功: {pdf_path} -> {xls_path}")
        return True
    except Exception as e:
        print(f"转换失败: {str(e)}")
        return False

def main():
    parser = argparse.ArgumentParser(description='PDF 转 Excel 文件')
    parser.add_argument('-i', '--input', required=True, help='输入 PDF 文件路径')
    parser.add_argument('-o', '--output', required=True, help='输出 Excel 文件路径')
    
    args = parser.parse_args()
    
    if not os.path.exists(args.input):
        print(f"错误: 输入文件不存在 {args.input}")
        sys.exit(1)
    
    success = pdf_to_xls(args.input, args.output)
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()