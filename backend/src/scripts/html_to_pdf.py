#!/usr/bin/env python3
"""
HTML 转 PDF 转换脚本 - 使用 xhtml2pdf
修复 CSS 语法问题
"""

import sys
import os
import argparse
from io import BytesIO

try:
    from xhtml2pdf import pisa
    XHTML2PDF_AVAILABLE = True
except ImportError:
    XHTML2PDF_AVAILABLE = False
    print("错误: 请安装 xhtml2pdf: pip install xhtml2pdf")

def convert_html_to_pdf(source_html, output_path):
    """
    将 HTML 转换为 PDF
    """
    try:
        # 创建 PDF
        with open(output_path, "wb") as output_file:
            # 转换 HTML 到 PDF
            pisa_status = pisa.CreatePDF(
                source_html,
                dest=output_file,
                encoding='utf-8'
            )
        
        # 返回转换状态
        return not pisa_status.err
    
    except Exception as e:
        print(f"PDF 转换异常: {str(e)}")
        return False

def enhance_html_content(html_content):
    """
    增强 HTML 内容，添加简单的 CSS 样式
    使用 xhtml2pdf 支持的 CSS 语法
    """
    # 简化的 CSS 样式（xhtml2pdf 兼容）
    enhanced_css = """
    <style>
        @page {
            size: A4;
            margin: 1cm;
        }
        
        body {
            font-family: "Microsoft YaHei", "SimSun", "Arial", sans-serif;
            font-size: 12pt;
            line-height: 1.6;
            color: #333333;
            margin: 0;
            padding: 0;
        }
        
        h1 {
            font-size: 18pt;
            color: #2c3e50;
            margin: 20px 0 10px 0;
            border-bottom: 2px solid #3498db;
            padding-bottom: 10px;
        }
        
        h2 {
            font-size: 16pt;
            color: #34495e;
            margin: 15px 0 8px 0;
            border-bottom: 1px solid #bdc3c7;
            padding-bottom: 8px;
        }
        
        h3 {
            font-size: 14pt;
            color: #34495e;
            margin: 12px 0 6px 0;
        }
        
        p {
            margin: 10px 0;
            text-align: justify;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
        }
        
        th {
            border: 1px solid #dddddd;
            padding: 10px;
            text-align: left;
            background-color: #3498db;
            color: white;
            font-weight: bold;
        }
        
        td {
            border: 1px solid #dddddd;
            padding: 10px;
            text-align: left;
        }
        
        img {
            max-width: 100%;
            height: auto;
        }
        
        .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #3498db;
            padding-bottom: 15px;
        }
        
        .footer {
            text-align: center;
            margin-top: 30px;
            border-top: 1px solid #bdc3c7;
            padding-top: 15px;
            font-size: 10pt;
            color: #666666;
        }
    </style>
    """
    
    # 检查是否已经有样式
    if '<style>' not in html_content and '<STYLE>' not in html_content:
        # 插入样式到 head
        if '<head>' in html_content:
            html_content = html_content.replace('<head>', f'<head>{enhanced_css}')
        elif '<HEAD>' in html_content:
            html_content = html_content.replace('<HEAD>', f'<HEAD>{enhanced_css}')
        else:
            # 如果没有 head，在 body 前插入
            if '<body>' in html_content:
                html_content = html_content.replace('<body>', f'<head>{enhanced_css}</head><body>')
            elif '<BODY>' in html_content:
                html_content = html_content.replace('<BODY>', f'<head>{enhanced_css}</head><body>')
            else:
                # 如果连 body 都没有，包装整个内容
                html_content = f'<!DOCTYPE html><html><head>{enhanced_css}</head><body>{html_content}</body></html>'
    
    return html_content

def html_to_pdf(input_path, output_path):
    """
    主转换函数
    """
    try:
        print(f"开始转换: {input_path} -> {output_path}")
        
        # 检查输入文件
        if not os.path.exists(input_path):
            print(f"错误: 输入文件不存在 - {input_path}")
            return False
        
        # 读取 HTML 内容
        with open(input_path, 'r', encoding='utf-8') as f:
            html_content = f.read()
        
        print(f"读取 HTML 内容长度: {len(html_content)} 字符")
        
        # 增强 HTML 内容
        enhanced_html = enhance_html_content(html_content)
        print("HTML 内容增强完成")
        
        # 转换为 PDF
        print("开始 PDF 转换...")
        success = convert_html_to_pdf(enhanced_html, output_path)
        
        if success:
            # 验证输出文件
            if os.path.exists(output_path):
                file_size = os.path.getsize(output_path)
                print(f"转换成功: {output_path}")
                print(f"输出文件大小: {file_size} 字节")
                return True
            else:
                print("错误: 输出文件未生成")
                return False
        else:
            print("错误: PDF 转换失败")
            return False
            
    except Exception as e:
        print(f"HTML 转 PDF 失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def main():
    parser = argparse.ArgumentParser(description='HTML 转 PDF 转换工具 (xhtml2pdf)')
    parser.add_argument('-i', '--input', required=True, help='输入 HTML 文件路径')
    parser.add_argument('-o', '--output', required=True, help='输出 PDF 文件路径')
    
    args = parser.parse_args()
    
    if not os.path.exists(args.input):
        print(f"错误: 输入文件不存在 - {args.input}")
        sys.exit(1)
    
    if not XHTML2PDF_AVAILABLE:
        print("错误: xhtml2pdf 未安装，请运行: pip install xhtml2pdf")
        sys.exit(1)
    
    success = html_to_pdf(args.input, args.output)
    sys.exit(0 if success else 1)

if __name__ == '__main__':
    main()