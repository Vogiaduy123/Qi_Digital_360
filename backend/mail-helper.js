const nodemailer = require("nodemailer");

// Đọc cấu hình SMTP từ biến môi trường.
function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
  const from = process.env.MAIL_FROM || user;

  return { host, port, user, pass, secure, from };
}

// Tạo transporter Nodemailer theo cấu hình SMTP với timeout chống treo
function createMailTransporter(config) {
  const host = String(config.host || "").toLowerCase();
  const timeouts = {
    connectionTimeout: 10000, // 10 giây
    greetingTimeout: 10000,
    socketTimeout: 15000
  };

  if (host.includes("gmail") && config.port !== 465) {
    return nodemailer.createTransport({
      ...timeouts,
      service: "gmail",
      auth: {
        user: config.user,
        pass: config.pass
      }
    });
  }

  return nodemailer.createTransport({
    ...timeouts,
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass
    },
    tls: { rejectUnauthorized: false }
  });
}

// Đọc cấu hình gửi mail qua HTTP API (Resend/Brevo/SendGrid).
function getMailApiConfig() {
  const provider = String(process.env.MAIL_PROVIDER || "").trim().toLowerCase();
  const from = process.env.MAIL_FROM;

  return {
    provider,
    from,
    resendApiKey: process.env.RESEND_API_KEY,
    brevoApiKey: process.env.BREVO_API_KEY,
    sendgridApiKey: process.env.SENDGRID_API_KEY
  };
}

// Tách chuỗi email dạng "Name <email>" về object chuẩn.
function parseEmailAddress(email) {
  const value = String(email || "").trim();
  const match = value.match(/^(.*)<(.+)>$/);
  if (match) {
    return { name: match[1].trim().replace(/^"|"$/g, ""), email: match[2].trim() };
  }
  return { email: value };
}

// Gửi mail qua nhà cung cấp HTTP API theo MAIL_PROVIDER.
async function sendMailViaHttpApi({ provider, apiKey, from, toList, subject, text, html }) {
  const normalizedProvider = String(provider || "").toLowerCase();

  if (normalizedProvider === "resend") {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from,
        to: toList,
        subject,
        text,
        html
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.message || data?.error || `Resend error ${response.status}`);
    }

    return { messageId: data?.id || null, provider: "resend" };
  }

  if (normalizedProvider === "brevo") {
    const sender = parseEmailAddress(from);
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey
      },
      body: JSON.stringify({
        sender,
        to: toList.map(email => ({ email })),
        subject,
        textContent: text,
        htmlContent: html
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.message || data?.code || `Brevo error ${response.status}`);
    }

    return { messageId: data?.messageId || null, provider: "brevo" };
  }

  if (normalizedProvider === "sendgrid") {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from: parseEmailAddress(from),
        personalizations: [{ to: toList.map(email => ({ email })) }],
        subject,
        content: [
          { type: "text/plain", value: text || "" },
          { type: "text/html", value: html || "" }
        ]
      })
    });

    if (!response.ok) {
      const textBody = await response.text().catch(() => "");
      const snippet = String(textBody || "").slice(0, 300);
      throw new Error(snippet || `SendGrid error ${response.status}`);
    }

    return { messageId: null, provider: "sendgrid" };
  }

  throw new Error(`Unsupported mail provider: ${provider}`);
}

async function sendMailRaw({ to, subject, text, html }) {
  const mailApiConfig = getMailApiConfig();
  const mailFrom = mailApiConfig.from || process.env.MAIL_FROM || `Virtual Tour <${process.env.SMTP_USER}>`;

  const toList = Array.isArray(to) ? to : String(to || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!toList.length) {
    throw new Error("Vui lòng nhập địa chỉ email người nhận.");
  }

  // HTTP API Provider
  if (mailApiConfig.provider && mailApiConfig.provider !== "smtp") {
    const apiKey = mailApiConfig.resendApiKey || mailApiConfig.brevoApiKey || mailApiConfig.sendgridApiKey;
    if (!apiKey) {
      throw new Error(`Chưa cấu hình API Key cho nhà cung cấp: ${mailApiConfig.provider}`);
    }
    return await sendMailViaHttpApi({
      provider: mailApiConfig.provider,
      apiKey,
      from: mailFrom,
      toList,
      subject: subject || "Thông báo từ Virtual Tour",
      text,
      html
    });
  }

  // SMTP Nodemailer fallback
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    throw new Error("Chưa cấu hình SMTP hoặc Mail Provider trong file .env.");
  }

  const smtpConfig = getSmtpConfig();
  const transporter = createMailTransporter(smtpConfig);

  const info = await transporter.sendMail({
    from: mailFrom,
    to: toList.join(", "),
    subject: subject || "Thông báo từ Virtual Tour 360",
    text,
    html
  });

  return { messageId: info.messageId, provider: "smtp" };
}

module.exports = {
  getSmtpConfig,
  createMailTransporter,
  getMailApiConfig,
  parseEmailAddress,
  sendMailViaHttpApi,
  sendMailRaw
};
