const { spawn } = require('child_process');
const child = spawn('npx', ['@striderlabs/mcp-opentable'], { stdio: ['pipe', 'pipe', 'inherit'] });
const req = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: process.argv[2], arguments: JSON.parse(process.argv[3] || '{}') } };
let buffer = '';
child.stdout.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
        if (!line.trim()) continue;
        try { const res = JSON.parse(line); if (res.id === 1) { console.log(JSON.stringify(res, null, 2)); child.kill(); process.exit(0); } } catch (e) {}
    }
});
setTimeout(() => { child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'claw', version: '1.0' } } }) + '\n'); }, 1000);
setTimeout(() => { child.stdin.write(JSON.stringify(req) + '\n'); }, 2000);
setTimeout(() => { console.error('Timeout'); child.kill(); process.exit(1); }, 30000);
