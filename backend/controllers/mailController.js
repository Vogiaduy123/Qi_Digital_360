const { sendMailRaw } = require("../services/mailService");

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildVirtualTourMailContent({ pageUrl, summary, notes }) {
  const safeSummary = summary && String(summary).trim() ? String(summary).trim() : "(Không có)";
  const safePageUrl = pageUrl && String(pageUrl).trim() ? String(pageUrl).trim() : "";
  const safeNotes = Array.isArray(notes) ? notes : [];

  const formatCoord = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(6) : "N/A";
  };

  const notesHtml = safeNotes.length
    ? safeNotes
        .map((note) => {
          const roomName = escapeHtml(note?.roomName || "Không xác định");
          const content = escapeHtml(note?.content || "");
          const yaw = escapeHtml(formatCoord(note?.yaw));
          const pitch = escapeHtml(formatCoord(note?.pitch));
          const time = escapeHtml(note?.time || new Date().toISOString());

          return `
            <li style="margin-bottom: 10px;">
              <div><strong>Phòng:</strong> ${roomName}</div>
              <div><strong>Nội dung:</strong> ${content || "(Trống)"}</div>
              <div><strong>Tọa độ:</strong> yaw=${yaw}, pitch=${pitch}</div>
              <div><strong>Thời gian:</strong> ${time}</div>
            </li>
          `;
        })
        .join("")
    : "<li>Không có ghi chú.</li>";

  const html = `
    <div style="font-family: Arial, sans-serif; color: #222; line-height: 1.5;">
      <h2 style="margin-bottom: 18px;">GHI CHÚ TỪ VIRTUAL TOUR</h2>
      ${safePageUrl ? `<p><strong>Trang:</strong> <a href="${escapeHtml(safePageUrl)}">${escapeHtml(safePageUrl)}</a></p>` : ""}
      <p><strong>Nội dung tổng quát:</strong><br>${escapeHtml(safeSummary)}</p>
      <div style="margin-top: 12px;"><strong>Danh sách ghi chú:</strong></div>
      <ol style="padding-left: 18px; margin-top: 8px;">${notesHtml}</ol>
    </div>
  `;

  const notesText = safeNotes.length
    ? safeNotes
        .map((note, index) => {
          const roomName = note?.roomName || "Không xác định";
          const content = note?.content || "(Trống)";
          const yaw = formatCoord(note?.yaw);
          const pitch = formatCoord(note?.pitch);
          const time = note?.time || new Date().toISOString();
          return `${index + 1}. Phòng: ${roomName}\n   Nội dung: ${content}\n   -Tọa độ: yaw=${yaw}, pitch=${pitch}\n   -Thời gian: ${time}`;
        })
        .join("\n\n")
    : "1. Không có ghi chú.";

  const text = `GHI CHÚ TỪ VIRTUAL TOUR\n\n${safePageUrl ? `Trang: ${safePageUrl}\n\n` : ""}Nội dung tổng quát:\n${safeSummary}\n\nDanh sách ghi chú:\n${notesText}`;

  return { html, text };
}

async function sendMailMessage({ to, subject, body, html, pageUrl, summary, notes }) {
  let finalHtml = html;
  let finalText = body;

  if (!finalHtml && Array.isArray(notes) && notes.length > 0) {
    const built = buildVirtualTourMailContent({ pageUrl, summary: summary || body, notes });
    finalHtml = built.html;
    finalText = built.text;
  } else if (!finalHtml) {
    const safeSubject = escapeHtml(subject || "Thông báo từ Virtual Tour");
    const safeBody = escapeHtml(body || "").replace(/\n/g, "<br>");
    finalHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #ffffff; color: #333333; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h2 style="color: #4f46e5; margin-top: 0; margin-bottom: 16px;">${safeSubject}</h2>
        <div style="font-size: 15px; line-height: 1.6; margin-bottom: 24px;">${safeBody}</div>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
        <p style="font-size: 12px; color: #64748b; text-align: center; margin: 0;">Qi Technologies · Virtual Tour Manager</p>
      </div>
    `;
  }

  return await sendMailRaw({
    to,
    subject: subject || "Thông báo từ Virtual Tour",
    text: finalText || body,
    html: finalHtml
  });
}

class MailController {
  static async sendMail(req, res) {
    try {
      const { to, subject, body, html, pageUrl, summary, notes } = req.body;
      const recipient = to || process.env.SMTP_USER;

      if (!recipient) {
        return res.status(400).json({ success: false, error: "Vui lòng nhập địa chỉ email người nhận." });
      }

      const result = await sendMailMessage({
        to: recipient,
        subject,
        body,
        html,
        pageUrl,
        summary,
        notes
      });

      res.json({ success: true, message: "Gửi thư thành công!", details: result });
    } catch (err) {
      console.error("[Mail Route Error]:", err.message);
      res.status(500).json({ success: false, error: err.message || "Không thể gửi email" });
    }
  }
}

module.exports = MailController;
