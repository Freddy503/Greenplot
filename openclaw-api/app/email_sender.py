"""
email_sender.py
Handles HTML email rendering and delivery via Resend API.
"""

import re
import httpx
from typing import Optional
from app.config import settings

# Lazy import resend so app starts even if not installed
try:
    import resend as _resend
except ImportError:
    _resend = None


def _md_to_html(text: str, base_color: str = "#D1D5DB") -> str:
    """Convert basic markdown to inline HTML for email."""
    lines = text.split("\n")
    html_parts = []
    in_list = False

    for line in lines:
        stripped = line.strip()
        if not stripped:
            if in_list:
                html_parts.append("</ul>")
                in_list = False
            continue

        # Detect bullet lines: * item or - item
        is_bullet = stripped.startswith("* ") or stripped.startswith("- ")
        if is_bullet:
            stripped = stripped[2:]

        # Convert **bold** → <strong>
        stripped = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', stripped)
        # Convert *italic* → <em>
        stripped = re.sub(r'\*(.+?)\*', r'<em>\1</em>', stripped)
        # Convert [text](url) → <a>
        stripped = re.sub(
            r'\[([^\]]+)\]\((https?://[^\)]+)\)',
            r'<a href="\2" style="color:#6B7280;">\1</a>',
            stripped
        )

        if is_bullet:
            if not in_list:
                html_parts.append(f'<ul style="margin:8px 0;padding-left:20px;color:{base_color};">')
                in_list = True
            html_parts.append(f'<li style="margin:4px 0;line-height:1.6;">{stripped}</li>')
        else:
            if in_list:
                html_parts.append("</ul>")
                in_list = False
            html_parts.append(
                f'<p style="margin:4px 0 10px;color:{base_color};line-height:1.6;">{stripped}</p>'
            )

    if in_list:
        html_parts.append("</ul>")

    return "\n".join(html_parts)


def _icon_emoji(icon: str) -> str:
    """Map material symbol names to simple emoji for email fallback."""
    _map = {
        "light_mode": "☀️", "newspaper": "📰", "psychology": "🔮",
        "assessment": "📊", "emoji_events": "🏆", "school": "🎓",
        "article": "📄", "tips_and_updates": "💡", "bolt": "⚡",
        "eco": "🌱", "chat": "💬", "explore": "🌍", "science": "🔬",
        "trending_up": "📈", "star": "⭐", "warning": "⚠️",
    }
    return _map.get(icon, "•")


def render_briefing_html(briefing: dict) -> str:
    """
    Render a briefing dict into styled HTML email.
    Matches the format: header, sections with icons, sources, footer.
    """
    type_colors = {
        "morning_spark": "#F59E0B",
        "daily_briefing": "#3B82F6",
        "reflection": "#8B5CF6",
        "weekly_eval": "#10B981",
        "biweekly_challenge": "#EF4444",
        "academic_digest": "#6366F1",
    }
    accent = type_colors.get(briefing.get("type", ""), "#6366F1")

    title = briefing.get("title", "Seedify Digest")
    subtitle = briefing.get("subtitle", "")
    sections = briefing.get("sections", [])

    # Build sections HTML
    sections_html = ""
    for section in sections:
        icon = section.get("icon", "")
        icon_str = _icon_emoji(icon)
        sec_title = section.get("title", "")
        content = section.get("content", "")
        sources = section.get("sources", [])

        if isinstance(content, list):
            content_html = _md_to_html("\n".join(str(item) for item in content))
        else:
            content_html = _md_to_html(content or "")

        sources_html = ""
        if sources:
            links = " &nbsp;·&nbsp; ".join(
                f'<a href="{s["url"]}" style="color:{accent};text-decoration:none;">{s["title"]}</a>'
                for s in sources
            )
            sources_html = f'<p style="margin:8px 0 0;font-size:12px;color:#6B7280;">{links}</p>'

        header_html = ""
        if sec_title:
            header_html = f'''
            <tr><td style="padding:20px 32px 8px;">
              <p style="margin:0;font-size:13px;font-weight:700;color:{accent};letter-spacing:0.05em;text-transform:uppercase;">
                {icon_str} {sec_title}
              </p>
            </td></tr>'''

        sections_html += f'''
        {header_html}
        <tr><td style="padding:0 32px 4px;">
          {content_html}
          {sources_html}
        </td></tr>
        <tr><td style="padding:0 32px 16px;">
          <hr style="border:none;border-top:1px solid #374151;margin:0;">
        </td></tr>'''

    html = f'''<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>{title}</title></head>
<body style="margin:0;padding:0;background:#111827;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#111827;">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="100%" style="max-width:600px;background:#1F2937;border-radius:16px;overflow:hidden;">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,{accent}33,transparent);padding:28px 32px 20px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:{accent};letter-spacing:0.1em;text-transform:uppercase;">Seedify</p>
          <h1 style="margin:0;font-size:22px;font-weight:700;color:#F9FAFB;">{title}</h1>
          {f'<p style="margin:6px 0 0;font-size:13px;color:#9CA3AF;">{subtitle}</p>' if subtitle else ''}
        </td></tr>

        <!-- Sections -->
        {sections_html}

        <!-- Footer -->
        <tr><td style="padding:20px 32px;background:#111827;">
          <p style="margin:0;font-size:11px;color:#4B5563;text-align:center;">
            Seedify · Your personal knowledge flywheel<br>
            <a href="https://seedify-six.vercel.app" style="color:#6B7280;text-decoration:none;">Open App</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>'''
    return html


def fetch_arxiv_pdf(url: str) -> Optional[bytes]:
    """
    Given an arXiv URL (abs or pdf), download the PDF.
    Returns bytes or None on failure/too large.
    """
    # Normalize to PDF URL
    pdf_url = re.sub(r'arxiv\.org/abs/', 'arxiv.org/pdf/', url)
    if not pdf_url.endswith('.pdf'):
        pdf_url = pdf_url.rstrip('/') + '.pdf'

    try:
        resp = httpx.get(pdf_url, timeout=15.0, follow_redirects=True)
        if resp.status_code != 200:
            return None
        content = resp.content
        if len(content) > 5 * 1024 * 1024:  # 5MB limit
            return None
        return content
    except Exception as e:
        print(f"[email_sender] arXiv PDF fetch failed for {pdf_url}: {e}")
        return None


def collect_arxiv_pdfs(briefing: dict) -> list:
    """
    Scan all section sources for arXiv URLs, download PDFs.
    Returns list of {"filename": "...", "content": bytes}.
    """
    attachments = []
    seen_urls = set()
    for section in briefing.get("sections", []):
        for source in section.get("sources", []):
            url = source.get("url", "")
            if "arxiv.org" in url and url not in seen_urls:
                seen_urls.add(url)
                pdf_bytes = fetch_arxiv_pdf(url)
                if pdf_bytes:
                    # Derive filename from arXiv ID
                    arxiv_id = re.search(r'(\d{4}\.\d{4,5})', url)
                    filename = f"arxiv-{arxiv_id.group(1)}.pdf" if arxiv_id else "paper.pdf"
                    attachments.append({"filename": filename, "content": pdf_bytes})
                    print(f"[email_sender] Attached {filename} ({len(pdf_bytes)//1024}KB)")
    return attachments


def send_briefing_email(to: str, briefing: dict, attachments: list = None) -> bool:
    """
    Render briefing as HTML and send via Resend.
    attachments: list of {"filename": str, "content": bytes}
    """
    if not settings.RESEND_API_KEY:
        print("[email_sender] RESEND_API_KEY not set — skipping email")
        return False
    if _resend is None:
        print("[email_sender] resend package not installed")
        return False

    _resend.api_key = settings.RESEND_API_KEY
    html = render_briefing_html(briefing)
    subject = briefing.get("title", "Seedify Digest")

    params: dict = {
        "from": settings.EMAIL_FROM,
        "to": [to],
        "subject": subject,
        "html": html,
    }

    if attachments:
        params["attachments"] = [
            {"filename": a["filename"], "content": list(a["content"])}
            for a in attachments
        ]

    try:
        _resend.Emails.send(params)
        print(f"[email_sender] Sent '{subject}' to {to}")
        return True
    except Exception as e:
        print(f"[email_sender] Failed to send to {to}: {e}")
        return False
