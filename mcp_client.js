const { spawn } = require('child_process');

const child = spawn('npx', ['@striderlabs/mcp-opentable'], {
    stdio: ['pipe', 'pipe', 'inherit']
});

function send(req) {
    const msg = JSON.stringify(req) + '\n';
    child.stdin.write(msg);
}

let buffer = '';
child.stdout.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
        if (!line.trim()) continue;
        console.log('RECV:', line);
    }
});

setTimeout(() => {
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'claw', version: '1.0' } } });
    setTimeout(() => {
        send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
        setTimeout(() => child.kill(), 2000);
    }, 1000);
}, 1000);
