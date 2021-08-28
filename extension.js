const axios = require('axios');
const OBSWebSocket = require('obs-websocket-js');
const io = require('socket.io-client');
const ngrok = require('ngrok');
const TES = require('tesjs');

module.exports = nodecg => {
	const follower = nodecg.Replicant('follower');
	const subscriber = nodecg.Replicant('subscriber');
	const cheer = nodecg.Replicant('cheer');
	const donate = nodecg.Replicant('donate');
	const host = nodecg.Replicant('host');
	const raid = nodecg.Replicant('raid');

	axios.get(`https://api.streamelements.com/kappa/v2/sessions/${nodecg.bundleConfig.channelIdSE}`, {
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
		// TODO use StreamElements API only for tracking tips, replace rest with subscriptions
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

	const elements = io('https://realtime.streamelements.com', { transports: ['websocket'] });
	elements.on('connect', () => {
		elements.emit('authenticate', { method: 'jwt', token: nodecg.bundleConfig.jwtToken });
	});
	elements.on('event:test', seEventListener);
	elements.on('event', seEventListener);

	// TODO counters

	ngrok.connect(nodecg.bundleConfig.eventSubPort).then(url => {
		const eventSub = new TES({
			identity: nodecg.bundleConfig.twitchApp,
			listener: {
				baseURL: url,
				port: nodecg.bundleConfig.eventSubPort,
				secret: nodecg.bundleConfig.eventSubSecret
			}
		});
		eventSub.getSubscriptions().then(result => {
			result.data.forEach(sub => {
				eventSub.unsubscribe(sub.id);
			});
		});
		eventSub.on('channel.channel_points_custom_reward_redemption.add', event => {
			const sourceName = nodecg.bundleConfig.rewardMedia[event.reward.title];
			if (sourceName) {
				obs.send('RestartMedia', { sourceName });
			}
		});
		eventSub.subscribe('channel.channel_points_custom_reward_redemption.add',
			{ broadcaster_user_id: nodecg.bundleConfig.channelId }
		);
	});
};
