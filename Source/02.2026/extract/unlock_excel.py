# Excel VBA Unlock and Unhide Script
# This script automates the process of unlocking the VBA project and unhiding worksheets
# in an Excel workbook that has been unzipped.

import os
import xml.etree.ElementTree as ET

def unlock_vba_project(vba_bin_path):
    """
    Replaces the 'DPB=' string with 'DPx=' in the vbaProject.bin file to bypass the password.
    """
    if not os.path.exists(vba_bin_path):
        print(f"Error: {vba_bin_path} not found. Is this a macro-enabled workbook?")
        return False
        
    try:
        with open(vba_bin_path, 'rb') as f:
            data = f.read()
            
        if b'DPB=' in data:
            data = data.replace(b'DPB=', b'DPx=')
            
            with open(vba_bin_path, 'wb') as f:
                f.write(data)
            print("Successfully patched VBA project to bypass password.")
            return True
        else:
            print("VBA project doesn't appear to be password protected (no DPB= found), or already patched.")
            return False
            
    except Exception as e:
        print(f"Error modifying VBA project: {e}")
        return False

def unhide_worksheets(workbook_xml_path):
    """
    Removes the state="hidden" or state="veryHidden" attributes from sheets in workbook.xml.
    """
    if not os.path.exists(workbook_xml_path):
        print(f"Error: {workbook_xml_path} not found.")
        return False
        
    try:
        # Register namespaces to preserve them during write
        ET.register_namespace('', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
        ET.register_namespace('r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
        ET.register_namespace('mc', 'http://schemas.openxmlformats.org/markup-compatibility/2006')
        ET.register_namespace('x15', 'http://schemas.microsoft.com/office/spreadsheetml/2010/11/main')
        ET.register_namespace('xr', 'http://schemas.microsoft.com/office/spreadsheetml/2014/revision')
        ET.register_namespace('xr6', 'http://schemas.microsoft.com/office/spreadsheetml/2016/revision6')
        ET.register_namespace('xr10', 'http://schemas.microsoft.com/office/spreadsheetml/2016/revision10')
        ET.register_namespace('xr2', 'http://schemas.microsoft.com/office/spreadsheetml/2015/revision2')
        
        tree = ET.parse(workbook_xml_path)
        root = tree.getroot()
        
        sheets = root.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheets')
        if sheets is None:
            print("Could not find <sheets> tag in workbook.xml.")
            return False
            
        modified = False
        for sheet in sheets.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheet'):
            state = sheet.get('state')
            if state in ['hidden', 'veryHidden']:
                sheet_name = sheet.get('name', 'Unknown')
                print(f"Unhiding sheet: {sheet_name}")
                del sheet.attrib['state']
                modified = True
                
        if modified:
            tree.write(workbook_xml_path, xml_declaration=True, encoding='UTF-8', method='xml')
            
            # The ElementTree write sometimes drops the standalone="yes" attribute.
            # We add it back manually for safer compatibility with Excel.
            with open(workbook_xml_path, 'r', encoding='utf-8') as f:
                content = f.read()
            if 'standalone="yes"' not in content.split('?', 2)[1]:
                content = content.replace('<?xml version=\'1.0\' encoding=\'UTF-8\'?>', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
                with open(workbook_xml_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                    
            print("Successfully unhid worksheets.")
            return True
        else:
            print("No hidden worksheets found.")
            return False
            
    except Exception as e:
        print(f"Error modifying workbook.xml: {e}")
        return False

if __name__ == "__main__":
    # Assuming script is run from the directory containing the unzipped Excel files
    # or the parent directory containing the 'xl' folder.
    
    target_dir = os.path.dirname(os.path.abspath(__file__))
    xl_dir = os.path.join(target_dir, "xl")
    
    if not os.path.exists(xl_dir):
        # Maybe we are already inside the xl directory
        if os.path.basename(target_dir) == "xl":
             xl_dir = target_dir
        else:
             print("Please run this script from the directory containing the unzipped files (where the 'xl' folder is).")
             exit(1)

    vba_path = os.path.join(xl_dir, "vbaProject.bin")
    workbook_path = os.path.join(xl_dir, "workbook.xml")
    
    print("--- Starting Excel Unlock Tool ---")
    unlock_vba_project(vba_path)
    print("-" * 34)
    unhide_worksheets(workbook_path)
    print("--- Finished ---")
    print("You can now zip the contents and rename the extension back to .xlsm")
