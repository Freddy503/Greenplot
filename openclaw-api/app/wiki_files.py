from fastapi import APIRouter, HTTPException, Depends
from app.auth import get_current_user, get_optional_user
import os
import json
import re

router = APIRouter(prefix="/api/v1/wiki-files", tags=["wiki-files"])


@router.get("")
async def list_wiki_files(current_user=Depends(get_optional_user)):
    """List all available wiki markdown files."""
    wiki_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), '..', 'wiki')
    wiki_dir = os.path.normpath(wiki_dir)
    index_file = os.path.join(wiki_dir, 'index.json')

    if not os.path.exists(index_file):
        return {"files": []}

    with open(index_file, 'r') as f:
        index = json.load(f)

    return {
        "count": len(index),
        "files": index,
    }


@router.get("/{filename}")
async def download_wiki_file(filename: str, current_user=Depends(get_optional_user)):
    """Download a specific wiki markdown file."""
    wiki_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), '..', 'wiki')
    wiki_dir = os.path.normpath(wiki_dir)
    filepath = os.path.join(wiki_dir, filename)

    # Security: prevent path traversal
    filepath = os.path.normpath(filepath)
    if not filepath.startswith(wiki_dir):
        raise HTTPException(status_code=400, detail="Invalid filename")

    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail=f"File not found: {filename}")

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Check if this is a single file download or a zip
    if filename == 'all.zip' or filename.endswith('.zip'):
        # Handle zip downloads
        import zipfile
        import io
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            for f in os.listdir(wiki_dir):
                if f.endswith('.md'):
                    zf.write(os.path.join(wiki_dir, f), f)
            if os.path.exists(os.path.join(wiki_dir, 'index.json')):
                zf.write(os.path.join(wiki_dir, 'index.json'), 'index.json')
        buffer.seek(0)
        from fastapi.responses import StreamingResponse
        return StreamingResponse(
            buffer,
            media_type='application/zip',
            headers={'Content-Disposition': 'attachment; filename="greenplot-wiki.zip"'}
        )

    return {
        "filename": filename,
        "content": content,
    }
