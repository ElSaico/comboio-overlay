const axios = require('axios');
const OBSWebSocket = require('obs-websocket-js');
const io = require('socket.io-client');

module.exports = nodecg => {
	const follower = nodecg.Replicant('follower');
	const subscriber = nodecg.Replicant('subscriber');
	const cheer = nodecg.Replicant('cheer');
	const donate = nodecg.Replicant('donate');
	const host = nodecg.Replicant('host');
	const raid = nodecg.Replicant('raid');

	axios.get(`https://api.streamelements.com/kappa/v2/sessions/${nodecg.bundleConfig.channelId}`, {
		headers: {
			Authorization: `Bearer ${nodecg.bundleConfig.jwtToken}`
		}
	}).then(session => {
		follower.value = session.data.data['follower-latest'];
		subscriber.value = session.data.data['subscriber-latest'];
		cheer.value = session.data.data['cheer-latest'];
		donate.value = session.data.data['tip-latest'];
	});

	const obs = new OBSWebSocket();
	obs.connect(nodecg.bundleConfig.obs);

	function seEventListener(data) {
		switch (data.listener) {
			case 'follower-latest':
				follower.value = data.event;
          		obs.send('RestartMedia', {sourceName: 'Wololo'});
		  		break;
			case 'subscriber-latest':
				subscriber.value = data.event;
				obs.send('RestartMedia', {sourceName: 'Heavy Metal'});
				break;
			case 'cheer-latest':
				cheer.value = data.event;
				obs.send('RestartMedia', {sourceName: 'OH O GÁS'});
				break;
			case 'tip-latest':
				donate.value = data.event;
				obs.send('RestartMedia', {sourceName: 'OH O GÁS'});
				break;
			case 'host-latest':
				host.value = data.event;
				break;
			case 'raid-latest':
				raid.value = data.event;
				obs.send('RestartMedia', {sourceName: 'AAAAAAAA'});
				break;
			default:
				console.log(data);
				break;
		}
	}

	const streamElements = io('https://realtime.streamelements.com', { transports: ['websocket'] });
	streamElements.on('connect', () => {
		streamElements.emit('authenticate', { method: 'jwt', token: nodecg.bundleConfig.jwtToken });
	});
	streamElements.on('event:test', seEventListener);
	streamElements.on('event', seEventListener);

	// TODO counters
};
