// Sends a WeChat message through Server酱 (ServerChan, sct.ftqq.com).
// The receiver scans a QR code once on sct.ftqq.com to link their WeChat and
// get a SendKey; the key is stored as the SERVERCHAN_SENDKEY repo secret.
//
// Test from the command line: SERVERCHAN_SENDKEY=... node agent/wechat.mjs --test

/** Build the API URL. Works with Server酱 Turbo keys (SCT...) and Server酱³ keys (sctp<uid>t...). */
export function serverChanUrl(sendkey) {
  const key = String(sendkey).trim();
  const sc3 = key.match(/^sctp(\d+)t/i);
  return sc3
    ? `https://${sc3[1]}.push.ft07.com/send/${key}.send`
    : `https://sctapi.ftqq.com/${key}.send`;
}

/** Server酱 limits titles to 32 characters. */
export function clip(text, max) {
  const chars = Array.from(String(text));
  return chars.length <= max ? chars.join('') : chars.slice(0, max - 1).join('') + '…';
}

/**
 * Send one message. Throws if Server酱 reports an error.
 * @param {{sendkey: string, title: string, desp: string, short?: string, fetchImpl?: typeof fetch}} msg
 */
export async function sendWeChat({ sendkey, title, desp, short, fetchImpl = fetch }) {
  const res = await fetchImpl(serverChanUrl(sendkey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json;charset=utf-8' },
    body: JSON.stringify({ title: clip(title, 32), desp, ...(short ? { short: clip(short, 64) } : {}) }),
  });
  let body = {};
  try {
    body = await res.json();
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok || body.code !== 0) {
    throw new Error(`Server酱 error (HTTP ${res.status}): ${body.message ?? body.info ?? 'unknown'}`);
  }
  return body;
}

const KIND_LABEL = { popup: '🎪 快闪活动', deal: '🐑 羊毛优惠' };

/**
 * Turn stand-out items into a WeChat message.
 * @param {{kind: 'popup'|'deal', category: {zh: string}, f: any}[]} items
 * @param {{pageUrl?: string, welcome?: boolean, moreCount?: number}} opts
 */
export function buildMessage(items, { pageUrl, welcome = false, moreCount = 0 } = {}) {
  // Deals (羊毛) first, matching the order in the message body.
  items = [...items].sort((a, b) => Number(a.kind !== 'deal') - Number(b.kind !== 'deal'));
  const first = items[0]?.f;
  const title = welcome
    ? `曼城快闪已开通：今天有${items.length}条精选`
    : `${items.every((i) => i.kind === 'deal') ? '曼城今日羊毛' : '曼城今日精选'}${items.length}条：${first?.title ?? ''}`;

  const lines = [];
  if (welcome) lines.push('你好！以后每天早上有新的精选快闪和羊毛，会在这里提醒你 🎉', '');
  for (const kind of ['deal', 'popup']) {
    const group = items.filter((i) => i.kind === kind);
    if (!group.length) continue;
    lines.push(`**${KIND_LABEL[kind]}**`, '');
    for (const { category, f } of group) {
      lines.push(`- **${category.zh}** · [${f.title}](${f.url})`);
      const extra = [f.offer, f.dates, f.location].filter(Boolean).join(' · ');
      if (extra) lines.push(`  ${extra}`);
    }
    lines.push('');
  }
  if (moreCount > 0) lines.push(`另外还有 ${moreCount} 条新内容。`, '');
  if (pageUrl) lines.push(`[打开曼城快闪看全部](${pageUrl})`);

  const short = items
    .slice(0, 3)
    .map((i) => i.f.title)
    .join('；');
  return { title, desp: lines.join('\n'), short };
}

async function main() {
  const sendkey = process.env.SERVERCHAN_SENDKEY;
  if (!sendkey) {
    console.error('SERVERCHAN_SENDKEY is not set.');
    process.exit(1);
  }
  if (process.argv.includes('--test')) {
    const pageUrl = process.env.PAGE_URL;
    await sendWeChat({
      sendkey,
      title: '曼城快闪：测试消息',
      desp: ['微信提醒设置成功 ✅', '', '以后有新的精选快闪和羊毛，会在这里提醒你。', pageUrl ? `\n[打开曼城快闪](${pageUrl})` : '']
        .join('\n'),
    });
    console.log('Test message sent.');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
