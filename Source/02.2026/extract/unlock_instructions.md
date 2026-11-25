# Unlock Excel Workbook: Panasonic - Inductor - Selection Tool - Feb2026

This document outlines the exact steps taken to unlock the VBA project and unhide the worksheets for this specific workbook.

## 1. What was changed in the source files
1. **Bypassed VBA Password Protection**:
   - **File Modified:** `xl/vbaProject.bin`
   - **Action:** Replaced the binary string `DPB=` with `DPx=`. This invalidates the password flag, allowing you to view the macros without the password.
2. **Unhid Protected Worksheets**:
   - **File Modified:** `xl/workbook.xml`
   - **Action:** Removed the `state="veryHidden"` attribute from the following sheet definitions:
     - `All Data`
     - `Utility`
     - `計算sheet`
     - `Wav`

## 2. How to repackage and open the unlocked file

Since the files are currently unzipped in the `Panasonic - Inductor - Selection Tool - Feb2026 - Kopie` folder, you need to repackage them back into an `.xlsm` file in order for Excel to read them properly.

1. **Select All Source Files**: Inside the folder, select the core components: `[Content_Types].xml`, `_rels`, `customXml`, `docMetadata`, `docProps`, and the `xl` folder.
2. **Zip the Contents**: Right-click the selected files and choose **Compress to ZIP file** (or use an archiving tool like 7-Zip).
3. **Rename Extension**: Rename the newly created `.zip` file's extension to `.xlsm` (e.g., `Panasonic_Unlocked.xlsm`).
   - *(Note: It must be `.xlsm` instead of `.xlsx` because the workbook contains a macro project `vbaProject.bin`.)*

## 3. Accessing the VBA Editor
When you open your new `.xlsm` file in Excel:
1. Excel might show a prompt complaining that the workbook is corrupted or that "The project password is invalid". Simply click **Yes / OK** to continue.
2. Press **Alt + F11** on your keyboard to open the VBA Editor. You will have full access to the source code without entering a password.
3. **(Optional) Permanently clear the password lock**: In the VBA Editor, go to **Tools** > **VBAProject Properties** > **Protection** tab. Uncheck "Lock project for viewing", clear any password fields, and click OK. Then save your Excel file normally to fix the "invalid password" warning for future opening.
