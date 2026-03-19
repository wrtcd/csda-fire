# Fix "SSL module is not available" in Anaconda (Windows)

If you see:
```text
SSLError: Can't connect to HTTPS URL because the SSL module is not available.
```
when running the CONUS/Satellogic script, your Anaconda Python is not finding the OpenSSL DLLs.

## Fix 1: Add Anaconda `Library\bin` to PATH (recommended)

1. Press **Win + R**, type `sysdm.cpl`, Enter → **Advanced** tab → **Environment Variables**.
2. Under **User variables** (or **System variables**), select **Path** → **Edit**.
3. Add these two lines (adjust if your Anaconda is elsewhere):
   - `C:\Users\aeaturu\Anaconda3`
   - `C:\Users\aeaturu\Anaconda3\Library\bin`
4. **OK** out, **close and reopen** Cursor/terminal, then run the script again.

Or in the **current PowerShell session** only:
```powershell
$env:Path = "C:\Users\aeaturu\Anaconda3\Library\bin;C:\Users\aeaturu\Anaconda3;" + $env:Path
```
Then run:
```powershell
cd "c:\Users\aeaturu\Desktop\WORK MARCH 2026\csda"
C:\Users\aeaturu\Anaconda3\python.exe scripts\run_find_fire_for_gee.py
```

## Fix 2: Copy OpenSSL DLLs into `DLLs` (if Fix 1 doesn’t help)

Python looks for SSL in `Anaconda3\DLLs`. Copy the OpenSSL DLLs there:

1. Open **File Explorer** and go to:
   `C:\Users\aeaturu\Anaconda3\Library\bin`
2. Copy these files (exact names may vary, e.g. `libssl-1_1-x64.dll` or `libssl-3-x64.dll`):
   - `libcrypto-*.dll`
   - `libssl-*.dll`
3. Paste them into:
   `C:\Users\aeaturu\Anaconda3\DLLs`
4. If `DLLs` doesn’t exist, create it. Then run the script again.

## Fix 3: Use Anaconda Prompt

Open **Anaconda Prompt** from the Start menu (it sets PATH correctly), then:

```bat
cd "c:\Users\aeaturu\Desktop\WORK MARCH 2026\csda"
python scripts\run_find_fire_for_gee.py
```

## Fix 4: New conda env with working SSL

Create a fresh environment (often has working SSL):

```bat
conda create -n csda python=3.11 -y
conda activate csda
pip install pystac-client geopandas requests
cd "c:\Users\aeaturu\Desktop\WORK MARCH 2026\csda"
python scripts\run_find_fire_for_gee.py
```

After one of these, the CONUS/Satellogic pipeline should be able to reach CSDAP over HTTPS.
