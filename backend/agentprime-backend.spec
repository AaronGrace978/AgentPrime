# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec file for AgentPrime Backend
# Run with: pyinstaller agentprime-backend.spec

import os
import sys

block_cipher = None

# Path to the backend app
backend_path = os.path.dirname(os.path.abspath(SPEC))
app_path = os.path.join(backend_path, 'app')

a = Analysis(
    ['run.py'],
    pathex=[backend_path],
    binaries=[],
    datas=[
        # Include any data files your app needs
        (os.path.join(app_path, 'api'), 'app/api'),
        (os.path.join(app_path, 'core'), 'app/core'),
    ],
    hiddenimports=[
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'fastapi',
        'pydantic',
        'starlette',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='agentprime-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # Set to False for GUI app without console
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,  # Add icon path if desired
)
