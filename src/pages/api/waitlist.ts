import type { APIRoute } from 'astro';
import { Resend } from 'resend';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function confirmHtml(lang: string, email: string) {
  const isPt = lang === 'pt';
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${isPt ? 'Você está na lista do Maru!' : "You're on the Maru list!"}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#fbf3ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:40px 16px}
  .wrap{max-width:520px;margin:0 auto}
  .card{background:#fff;border-radius:24px;padding:40px 36px;box-shadow:0 8px 32px rgba(42,33,28,.1)}
  .logo{font-size:26px;font-weight:800;color:#2a211c;letter-spacing:-.02em}
  .face{width:56px;height:56px;border-radius:50%;background:#ec7e54;display:flex;align-items:center;justify-content:center;font-size:26px;color:#fff;margin:28px 0 16px}
  h1{font-size:24px;font-weight:800;color:#2a211c;margin-bottom:12px}
  p{font-size:16px;line-height:1.6;color:#5d544c;margin-bottom:12px}
  .badge{display:inline-block;background:#fbf3ec;border:1px solid #f3dccd;border-radius:999px;padding:8px 18px;font-size:14px;font-weight:700;color:#c85a33;margin-top:8px}
  .footer{margin-top:32px;padding-top:20px;border-top:1px solid #f3e6da;font-size:12px;color:#9a8678;line-height:1.6}
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="logo">maru</div>
    <div class="face">✓</div>
    <h1>${isPt ? 'Você está na lista!' : "You're on the list!"}</h1>
    <p>${isPt
      ? 'Ficamos muito felizes que você queira conhecer o Maru. Você é um dos primeiros a se inscrever — a gente te avisa assim que o beta abrir.'
      : "We're glad you want to meet Maru. You're among the very first to sign up — we'll ping you the moment the beta opens."
    }</p>
    <p>${isPt ? 'Enquanto isso, fica de olho na caixa de entrada.' : 'Keep an eye on your inbox.'}</p>
    <div class="badge">✓ ${isPt ? 'Inscrição confirmada' : 'Sign-up confirmed'}</div>
    <div class="footer">
      ${isPt
        ? 'O Maru é uma ferramenta de lembrete e não substitui orientação médica profissional. Sempre consulte seu médico sobre sua medicação.'
        : 'Maru is a reminder tool and is not a substitute for professional medical advice. Always consult your doctor about your medication.'
      }<br><br>
      © 2026 maru · ${isPt ? 'feito com cuidado' : 'made with care'} · ${email}
    </div>
  </div>
</div>
</body>
</html>`;
}

export const POST: APIRoute = async ({ request }) => {
  let body: { email?: string; lang?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'bad-request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const email = String(body.email ?? '').trim().toLowerCase();
  const lang = body.lang === 'pt' ? 'pt' : 'en';

  if (!EMAIL_RE.test(email)) {
    return new Response(JSON.stringify({ error: 'invalid-email' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = import.meta.env.RESEND_API_KEY;
  if (!apiKey) {
    // Demo mode: no API key configured yet
    return new Response(JSON.stringify({ ok: true, demo: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const resend = new Resend(apiKey);
  const from = import.meta.env.RESEND_FROM ?? 'Maru <onboarding@resend.dev>';
  const audienceId = import.meta.env.RESEND_AUDIENCE_ID;
  const notifyEmail = import.meta.env.NOTIFY_EMAIL;

  try {
    const ops: Promise<unknown>[] = [];

    if (audienceId) {
      ops.push(
        resend.contacts.create({ email, audienceId, unsubscribed: false })
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            if (!msg.includes('already exists')) throw err;
          })
      );
    }

    ops.push(
      resend.emails.send({
        from,
        to: email,
        subject: lang === 'pt' ? 'Você está na lista do Maru! ✓' : "You're on the Maru list! ✓",
        html: confirmHtml(lang, email),
      })
    );

    if (notifyEmail) {
      ops.push(
        resend.emails.send({
          from,
          to: notifyEmail,
          subject: `New Maru waitlist signup: ${email}`,
          html: `<p>New signup: <strong>${email}</strong> (lang: ${lang})</p>`,
        })
      );
    }

    await Promise.all(ops);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[waitlist]', err);
    return new Response(JSON.stringify({ error: 'server-error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
