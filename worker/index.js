// Receives mail from Cloudflare Email Routing and hands the raw message to
// Mailroom. Cloudflare has already checked SPF and DKIM by the time this runs
// and rejected anything that failed both.
export default {
  async email(message, env) {
    const response = await fetch(`${env.APP_URL}/api/inbound/cloudflare`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.INBOUND_SECRET}`,
        "content-type": "message/rfc822",
        "x-envelope-from": message.from,
        "x-envelope-to": message.to,
      },
      body: message.raw,
    });

    // Throwing makes Cloudflare try again a few times, then bounce the sender,
    // which beats the mail vanishing while the app is down. Forwarding only
    // after this also means a retry cannot send the copy twice.
    if (!response.ok) throw new Error(`mailroom answered ${response.status}`);

    // Forwarded by Cloudflare rather than re-sent by the app, so the original
    // sender and signatures survive the hop.
    if (env.FORWARD_TO) await message.forward(env.FORWARD_TO);
  },
};
