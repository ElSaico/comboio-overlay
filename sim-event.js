const { spawn } = require('child_process');
const cfg = require('../../cfg/comboio-overlay.json');

if (process.argv.length < 3) {
    console.error('event type required');
    process.exit(1);
}

const cli = spawn('twitch', [
    'event', 'trigger', process.argv[2],
    '-F', `http://localhost:${cfg.eventSub.port}/teswh/event`,
    '-t', cfg.channelId,
    '-s', cfg.eventSub.secret,
    ...process.argv.slice(3)
]);
cli.stdout.on('data', data => console.log(data.toString()));
cli.stderr.on('data', data => console.error(data.toString()));
