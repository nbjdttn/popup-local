// Exercises runSearch() against a fake Anthropic API: pause_turn -> report_findings.
import { runSearch } from '../src/lib/agent';

const calls: any[] = [];
const replies = [
  { stop_reason: 'pause_turn', content: [{ type: 'text', text: 'Searching…' }] },
  {
    stop_reason: 'tool_use',
    content: [{
      type: 'tool_use', id: 'toolu_1', name: 'report_findings',
      input: { findings: [
        { title: 'Pop Mart Labubu pop-up', brand: 'Pop Mart', summary: 'x', location: 'Westfield', dates: '1-10 Nov', offer: '', url: 'https://example.com/a' },
        { title: 'Pop Mart Labubu pop-up', brand: 'Pop Mart', summary: 'dup', location: '', dates: '', offer: '', url: 'https://example.com/a' },
        { title: 'No url item', brand: '', summary: '', location: '', dates: '', offer: '', url: 'not-a-url' },
      ] },
    }],
  },
];
globalThis.fetch = (async (url: any, init: any) => {
  calls.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
  const r = replies[calls.length - 1];
  const msg = { id: 'msg_' + calls.length, type: 'message', role: 'assistant', model: 'claude-opus-5-5',
    stop_sequence: null, stop_details: null, usage: { input_tokens: 1, output_tokens: 1 }, ...r };
  return new Response(JSON.stringify(msg), { status: 200, headers: { 'content-type': 'application/json' } });
}) as any;

(async () => {
  const res = await runSearch('popup', 'Pop Mart', { apiKey: 'sk-test', city: 'London', country: 'gb', categories: [] });
  const b = calls[0].body;
  const h = new Headers(calls[0].headers);
  console.log('calls:', calls.length, calls[0].url);
  console.log('beta header:', h.get('anthropic-beta'));
  console.log('model/fallbacks/thinking/effort:', b.model, b.fallbacks, JSON.stringify(b.thinking), JSON.stringify(b.output_config));
  console.log('tools:', b.tools.map((t: any) => t.type ?? t.name).join(', '), JSON.stringify(b.tools[0].user_location));
  console.log('2nd call messages:', calls[1].body.messages.map((m: any) => m.role).join(','));
  console.log('findings:', JSON.stringify(res.findings.map(f => f.title)));
  if (res.findings.length !== 1 || calls.length !== 2) { console.error('FAIL'); process.exit(1); }
  console.log('PASS');
})().catch(e => { console.error(e); process.exit(1); });
