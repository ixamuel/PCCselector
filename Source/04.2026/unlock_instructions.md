# Unlocked copy: Panasonic Inductor Selection Tool - Apr2026

`PCC_unlocked.xlsm` in this folder was produced by `python refresh.py` (see the
repository README). The source workbook
`Panasonic_Inductor_Selection_Tool - Apr2026.xlsm` is left untouched.

## What was changed

1. **VBA password flag bypassed**
   - **Part modified:** `xl/vbaProject.bin`
   - **Action:** the `DPB=` marker that holds the protection state was replaced
     with `DPx=`, which invalidates the password flag so the macros can be
     viewed without the password.
2. **Hidden worksheets unhidden**
   - **Part modified:** `xl/workbook.xml`
   - **Action:** `state="veryHidden"` (and `state="hidden"`) removed from
     `All Data`, `Utility`, `計算sheet` and `Wav`.

Every other part of the zip (media, drawings, VML, styles) is copied
byte-for-byte, so the result opens without the corruption problems the old
"unzip and repackage by hand" route caused.

## Using it

1. Open `PCC_unlocked.xlsm` in Excel. Excel may still warn about an invalid
   project password - click **Yes / OK** to continue.
2. Press **Alt + F11** for the VBA editor; the source code is readable without a
   password.
3. *(Optional)* To remove the warning for good: **Tools > VBAProject Properties
   > Protection**, uncheck *Lock project for viewing*, clear the password
   fields, click OK and save from Excel. Saving from Excel rewrites the file, so
   `python refresh.py` should be rerun afterwards to regenerate it from the
   original `.xlsm`.
