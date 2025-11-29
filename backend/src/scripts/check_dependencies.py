#!/usr/bin/env python3
"""检查所有 Python 脚本的依赖"""

def check_dependencies():
    dependencies = {
        'pdfminer.six': 'pdf_to_doc.py, pdf_to_txt.py',
        'pdfplumber': 'pdf_to_doc.py, pdf_to_txt.py, pdf_to_xls.py, pdf_to_ppt.py',
        'pymupdf': 'pdf_to_doc.py',
        'python-docx': 'pdf_to_doc.py, doc_to_html.py, html_to_word.py, txt_to_word.py, xls_to_doc.py',
        'python-pptx': 'pdf_to_ppt.py',
        'pandas': 'pdf_to_xls.py, txt_to_xls.py, xls_to_doc.py, xls_to_txt.py',
        'openpyxl': 'xls_to_doc.py, xls_to_txt.py',
        'beautifulsoup4': 'html_to_word.py',
        'xhtml2pdf': 'html_to_pdf.py'
    }
    
    print("检查 Python 依赖...")
    all_ok = True
    
    for package, scripts in dependencies.items():
        try:
            if package == 'pymupdf':
                import fitz
            else:
                __import__(package.replace('-', '_'))
            print(f"✓ {package:15} - 用于: {scripts}")
        except ImportError:
            print(f"✗ {package:15} - 缺失! 用于: {scripts}")
            all_ok = False
    
    if all_ok:
        print("\n所有依赖都已安装!")
    else:
        print("\n请安装缺失的依赖: pip install 包名")
    
    return all_ok

if __name__ == "__main__":
    check_dependencies()