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

    title = briefing.get("title", "Greenplot Digest")
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
          <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:{accent};letter-spacing:0.1em;text-transform:uppercase;">Greenplot</p>
          <h1 style="margin:0;font-size:22px;font-weight:700;color:#F9FAFB;">{title}</h1>
          {f'<p style="margin:6px 0 0;font-size:13px;color:#9CA3AF;">{subtitle}</p>' if subtitle else ''}
        </td></tr>

        <!-- Sections -->
        {sections_html}

        <!-- Footer -->
        <tr><td style="padding:20px 32px;background:#111827;">
          <p style="margin:0;font-size:11px;color:#4B5563;text-align:center;">
            Greenplot · Your personal knowledge flywheel<br>
            <a href="https://greenplot.ink" style="color:#6B7280;text-decoration:none;">Open App</a>
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


def render_invite_html(code: str, onboarding_url: str, email: str) -> str:
    """Designed invite email — Greenplot branding, prominent access code, one CTA."""
    return f"""<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background-color:#eceae4;">
  <div style="max-width:480px;margin:0 auto;padding:36px 20px 48px;font-family:'Helvetica Neue',Arial,sans-serif;">

    <!-- Wordmark -->
    <div style="text-align:center;margin-bottom:26px;">
      <span style="font-size:30px;">🌱</span><br>
      <span style="font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:24px;color:#141413;">Greenplot</span><br>
      <span style="font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#8a897f;">Private beta &middot; invite only</span>
    </div>

    <!-- Card -->
    <div style="background-color:#fafaf8;border-radius:22px;padding:34px 30px;border:1px solid #e3e1d8;">
      <h1 style="font-family:Georgia,'Times New Roman',serif;font-style:italic;font-weight:400;font-size:30px;line-height:1.15;color:#141413;margin:0 0 14px;">You're invited.</h1>
      <p style="font-size:14.5px;line-height:1.65;color:#5f5f5a;margin:0 0 26px;">
        Greenplot is your AI thinking partner — plant ideas, grow them into
        knowledge, and ship them with coding agents. A spot in the garden is
        waiting for you.
      </p>

      <!-- Access code -->
      <div style="text-align:center;margin-bottom:26px;">
        <div style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#8a897f;margin-bottom:8px;">Your access code</div>
        <div style="display:inline-block;background-color:#ffffff;border:1px solid #d8e8dd;border-radius:14px;padding:14px 26px;">
          <span style="font-family:'Courier New',monospace;font-size:28px;font-weight:700;letter-spacing:8px;color:#15803d;">{code}</span>
        </div>
      </div>

      <!-- CTA -->
      <div style="text-align:center;margin-bottom:18px;">
        <a href="{onboarding_url}"
           style="display:inline-block;background-color:#22c55e;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:15px 34px;border-radius:9999px;">
          Plant your first idea&nbsp;&nbsp;&rarr;
        </a>
      </div>

      <p style="font-size:12px;line-height:1.6;color:#a3a29c;text-align:center;margin:0;">
        The button carries your code — it unlocks the garden for<br>
        <span style="color:#5f5f5a;">{email}</span> automatically.
      </p>
    </div>

    <!-- What awaits -->
    <div style="padding:24px 10px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
        <tr><td style="font-size:13px;line-height:2.1;color:#5f5f5a;">🌱&nbsp;&nbsp;<strong style="color:#141413;">Plant</strong> — capture ideas &amp; research, enriched automatically</td></tr>
        <tr><td style="font-size:13px;line-height:2.1;color:#5f5f5a;">🌿&nbsp;&nbsp;<strong style="color:#141413;">Grow</strong> — a wiki that writes itself from your seeds</td></tr>
        <tr><td style="font-size:13px;line-height:2.1;color:#5f5f5a;">🚀&nbsp;&nbsp;<strong style="color:#141413;">Ship</strong> — specs that coding agents build into software</td></tr>
      </table>
    </div>

    <p style="font-size:11px;color:#a3a29c;text-align:center;margin:28px 0 0;">
      Greenplot &middot; A living laboratory for your ideas<br>
      Didn't expect this? You can safely ignore it.
    </p>
  </div>
</body>
</html>"""


def send_invite_email(to: str, code: str, onboarding_url: str) -> bool:
    """Send the designed private-beta invite (access code + deep link)."""
    if not settings.RESEND_API_KEY:
        print("[email_sender] RESEND_API_KEY not set — skipping invite email")
        return False
    if _resend is None:
        print("[email_sender] resend package not installed")
        return False
    _resend.api_key = settings.RESEND_API_KEY
    try:
        _resend.Emails.send({
            "from": settings.EMAIL_FROM,
            "to": to,
            "subject": "You're invited to Greenplot 🌱",
            "html": render_invite_html(code, onboarding_url, to),
        })
        print(f"[email_sender] Sent invite to {to}")
        return True
    except Exception as e:
        print(f"[email_sender] Failed to send invite to {to}: {e}")
        return False


def send_canvas_invite_email(to: str, owner_name: str, canvas_title: str, accept_url: str) -> bool:
    """Invite a collaborator to a shared Studio canvas."""
    if not settings.RESEND_API_KEY or _resend is None:
        print("[email_sender] cannot send canvas invite (Resend not configured)")
        return False
    _resend.api_key = settings.RESEND_API_KEY
    who = owner_name or "Someone"
    title = canvas_title or "a canvas"
    html = f"""
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#141413">
      <div style="font-size:22px;font-weight:700;color:#15803d;margin-bottom:8px">🌱 Greenplot</div>
      <h1 style="font-size:20px;margin:16px 0 8px">{who} shared a canvas with you</h1>
      <p style="font-size:15px;line-height:1.6;color:#5f5f5a">You've been invited to collaborate on <strong>{title}</strong> in Greenplot Studio — explore the PRDs and product vision.</p>
      <a href="{accept_url}" style="display:inline-block;margin:20px 0;background:#22c55e;color:#fff;text-decoration:none;font-weight:600;border-radius:9999px;padding:13px 28px;font-size:15px">Open the canvas →</a>
      <p style="font-size:12px;color:#a3a29c">If you didn't expect this, you can safely ignore this email.</p>
    </div>
    """
    try:
        _resend.Emails.send({
            "from": settings.EMAIL_FROM,
            "to": to,
            "subject": f"{who} shared a Greenplot canvas with you 🌱",
            "html": html,
        })
        print(f"[email_sender] Sent canvas invite to {to}")
        return True
    except Exception as e:
        print(f"[email_sender] Failed to send canvas invite to {to}: {e}")
        return False


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
    subject = briefing.get("title", "Greenplot Digest")

    params: dict = {
        "from": settings.EMAIL_FROM,
        "to": to,
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
