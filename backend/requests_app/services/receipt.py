"""Generate a PDF receipt for a completed ServiceRequest and upload it.

PDF generation uses ReportLab (pure Python, no system deps). Upload goes
through the existing Cloudinary helper, which falls back to a mock URL in
dev when no Cloudinary credentials are configured.
"""
import io
import logging

from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from drivers.services.storage import upload_document
from requests_app.models import ServiceRequest

logger = logging.getLogger(__name__)


def _fmt_dt(dt) -> str:
    if not dt:
        return "—"
    return timezone.localtime(dt).strftime("%d %b %Y, %H:%M")


def _safe(value, fallback: str = "—") -> str:
    if value in (None, ""):
        return fallback
    return str(value)


def render_receipt_pdf(sr: ServiceRequest) -> bytes:
    """Render the receipt for `sr` and return the PDF bytes."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        title=f"Biniman Receipt #{sr.pk}",
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
    )
    styles = getSampleStyleSheet()
    story = []

    story.append(Paragraph("<b>Biniman</b> — Service Receipt", styles["Title"]))
    story.append(Paragraph(f"Receipt for Request #{sr.pk}", styles["Heading4"]))
    story.append(Spacer(1, 6 * mm))

    payment = getattr(sr, "payment", None)
    customer = sr.customer
    driver = sr.driver
    driver_user = driver.user if driver else None

    meta_rows = [
        ["Status", sr.get_status_display()],
        ["Completed at", _fmt_dt(sr.completed_at)],
        ["Booked at", _fmt_dt(sr.created_at)],
        ["Customer", _safe(getattr(customer, "full_name", "") or customer.phone)],
        ["Customer phone", _safe(customer.phone)],
        ["Driver", _safe(getattr(driver_user, "full_name", "") if driver_user else "")],
        ["Vehicle", _safe(driver.vehicle_reg if driver else "")],
        ["Pickup", _safe(sr.pickup_address or f"{sr.pickup_lat}, {sr.pickup_lng}")],
        ["Waste type", sr.get_waste_type_display()],
        ["Volume tier", sr.get_volume_tier_display() if hasattr(sr, "get_volume_tier_display") else _safe(sr.volume_tier)],
    ]
    meta = Table(meta_rows, colWidths=[45 * mm, 120 * mm])
    meta.setStyle(
        TableStyle(
            [
                ("FONT", (0, 0), (-1, -1), "Helvetica", 10),
                ("FONT", (0, 0), (0, -1), "Helvetica-Bold", 10),
                ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#555555")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("LINEBELOW", (0, 0), (-1, -2), 0.25, colors.HexColor("#eeeeee")),
            ]
        )
    )
    story.append(meta)
    story.append(Spacer(1, 8 * mm))

    story.append(Paragraph("<b>Quote breakdown</b>", styles["Heading4"]))
    distance_km = f"{float(sr.quote_distance_km):.1f} km"
    quote_rows = [
        ["Description", "Amount (GHS)"],
        ["Base fee", f"{sr.quote_base_fee}"],
        [f"Distance ({distance_km})", f"{sr.quote_distance_fee}"],
        ["Tank size fee", f"{sr.quote_tier_fee}"],
        ["Total", f"{sr.quote_total}"],
    ]
    quote = Table(quote_rows, colWidths=[110 * mm, 55 * mm])
    quote.setStyle(
        TableStyle(
            [
                ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 10),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f3f4f6")),
                ("FONT", (0, 1), (-1, -2), "Helvetica", 10),
                ("FONT", (0, -1), (-1, -1), "Helvetica-Bold", 11),
                ("LINEABOVE", (0, -1), (-1, -1), 0.5, colors.HexColor("#999999")),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(quote)
    story.append(Spacer(1, 8 * mm))

    story.append(Paragraph("<b>Payment</b>", styles["Heading4"]))
    payment_rows = [
        ["Reference", _safe(payment.paystack_reference if payment else "")],
        ["Method", _safe(payment.get_method_display() if payment else "")],
        ["Status", _safe(payment.get_status_display() if payment else "")],
        ["Paid at", _fmt_dt(payment.paid_at) if payment else "—"],
        ["Amount", f"GHS {payment.amount}" if payment else "—"],
    ]
    pay = Table(payment_rows, colWidths=[45 * mm, 120 * mm])
    pay.setStyle(
        TableStyle(
            [
                ("FONT", (0, 0), (-1, -1), "Helvetica", 10),
                ("FONT", (0, 0), (0, -1), "Helvetica-Bold", 10),
                ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#555555")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(pay)
    story.append(Spacer(1, 12 * mm))

    story.append(
        Paragraph(
            "<font size=8 color='#888888'>Generated by Biniman on "
            f"{_fmt_dt(timezone.now())}. Keep this receipt for your records.</font>",
            styles["Normal"],
        )
    )

    doc.build(story)
    return buffer.getvalue()


def build_and_upload_receipt(sr: ServiceRequest) -> str:
    """Render the PDF, upload to Cloudinary, persist URL onto `sr`. Returns the URL."""
    pdf_bytes = render_receipt_pdf(sr)
    buf = io.BytesIO(pdf_bytes)
    buf.name = f"receipt-{sr.pk}.pdf"
    result = upload_document(buf, folder="biniman/receipts", resource_type="raw")
    url = result["url"]
    sr.receipt_url = url
    sr.receipt_generated_at = timezone.now()
    sr.save(update_fields=["receipt_url", "receipt_generated_at"])
    logger.info("Receipt generated for request=%s url=%s", sr.pk, url)
    return url
