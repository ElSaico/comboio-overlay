const { spawn } = require('child_process');
const cfg = require('../../cfg/comboio-overlay.json');

if (process.argv.length < 3) {
    console.error('event type required');
    process.exit(1);
}

const cli = spawn('twitch', [
    'event', 'trigger', process.argv[2],
    // FIXME twurple verification fails because reasons; also needs to map event URLs more accurately
    '-F', `https://${cfg.eventSub.hostname}/twitch/event/channel.${process.argv[2]}.${cfg.channel.id}`,
    '-t', cfg.channel.id,
    '-s', cfg.eventSub.secret,
    ...process.argv.slice(3)
]);
cli.stdout.on('data', data => console.log(data.toString()));
cli.stderr.on('data', data => console.error(data.toString()));
