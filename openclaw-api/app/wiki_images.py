import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter(prefix="/api/v1/wiki-images", tags=["wiki-images"])

IMAGES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                          "public", "wiki-images")

@router.get("/{filename}")
async def get_wiki_image(filename: str):
    """Serve locally stored wiki hero images."""
    filepath = os.path.join(IMAGES_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Image not found")
    if not filename.endswith(('.jpeg', '.jpg', '.png', '.webp')):
        raise HTTPException(status_code=400, detail="Invalid image type")
    return FileResponse(filepath, media_type="image/jpeg")
