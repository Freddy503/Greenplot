#!/usr/bin/env python3
"""
generate_briefing_image.py
Create a 4-quadrant concept image for the daily briefing.
Usage: python3 generate_briefing_image.py "Weather summary" "News headline" "Linke insight" "Creative prompt" /output/path.jpg
"""

import os, sys, json, time, urllib.request

BFL_API_KEY = open(os.path.expanduser('~/.config/bfl/api_key')).read().strip()

def generate_quadrant_image(quadrants, output_path):
    """
    quadrants: dict with keys 'top_left', 'top_right', 'bottom_left', 'bottom_right'
    Each value is a short phrase (2-4 words).
    Style: minimalist pastel, clean layout, 4 equal quadrants with labels.
    """
    prompt = (
        "Minimalist infographic poster, divided into four equal quadrants. "
        "Each quadrant has a soft pastel background (light blue, light green, light yellow, light pink) and centered bold sans-serif text. "
        f"Top left: \"{quadrants.get('top_left', 'Weather')}\"; "
        f"Top right: \"{quadrants.get('top_right', 'News')}\"; "
        f"Bottom left: \"{quadrants.get('bottom_left', 'Insight')}\"; "
        f"Bottom right: \"{quadrants.get('bottom_right', 'Exercise')}\". "
        "Clean, modern, no clutter, vector style."
    )
    
    # Submit to BFL Flux.dev
    req = urllib.request.Request(
        'https://api.bfl.ai/v1/flux-dev',
        data=json.dumps({'prompt': prompt, 'width': 1024, 'height': 1024}).encode(),
        headers={'x-key': BFL_API_KEY, 'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        res = json.loads(r.read())
    polling_url = res.get('polling_url')
    if not polling_url:
        raise Exception("No polling URL from BFL")
    
    # Poll
    for _ in range(30):
        time.sleep(3)
        poll_req = urllib.request.Request(polling_url, headers={'x-key': BFL_API_KEY})
        with urllib.request.urlopen(poll_req, timeout=30) as r:
            poll = json.loads(r.read())
        if poll.get('status') == 'Ready':
            image_url = poll.get('result', {}).get('sample')
            # Download
            img_req = urllib.request.Request(image_url)
            with urllib.request.urlopen(img_req, timeout=30) as r:
                img_data = r.read()
            with open(output_path, 'wb') as f:
                f.write(img_data)
            return output_path
        elif poll.get('status') in ('Error', 'Failed', 'Request Moderated', 'Content Moderated'):
            raise Exception(f"BFL failed: {poll.get('status')}")
    raise Exception("BFL timeout")

def main():
    if len(sys.argv) != 6:
        print("Usage: generate_briefing_image.py <top_left> <top_right> <bottom_left> <bottom_right> <output_path>")
        sys.exit(1)
    
    quadrants = {
        'top_left': sys.argv[1],
        'top_right': sys.argv[2],
        'bottom_left': sys.argv[3],
        'bottom_right': sys.argv[4]
    }
    output_path = sys.argv[5]
    
    try:
        result = generate_quadrant_image(quadrants, output_path)
        print(f"Image saved to: {result}")
    except Exception as e:
        print(f"Error generating image: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
