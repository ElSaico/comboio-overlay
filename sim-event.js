const { spawn } = require('child_process');
const cfg = require('../../cfg/comboio-overlay.json');

if (process.argv.length < 3) {
    console.error('event type required');
    process.exit(1);
}

spawn('twitch', [
    'event', 'trigger', process.argv[2],
    '-F', `http://localhost:${cfg.eventSubPort}/teswh/event`,
    '-t', cfg.channelId,
    '-s', cfg.eventSubSecret,
    ...process.argv.slice(3)
]);