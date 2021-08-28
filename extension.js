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
	const raid = nodecg.Replicant('raid');

	axios.get(`https://api.twitch.tv/helix/users/follows?to_id=${nodecg.bundleConfig.channelId}`, {
		headers: {
			Authorization: `Bearer ${nodecg.bundleConfig.twitchApp.token}`,
			'Client-Id': nodecg.bundleConfig.twitchApp.id
		}
	}).then(response => {
		follower.value = response.data.data[0].from_name;
	});
	axios.get(`https://api.streamelements.com/kappa/v2/sessions/${nodecg.bundleConfig.streamElements.channelId}`, {
		headers: {
			Authorization: `Bearer ${nodecg.bundleConfig.streamElements.jwtToken}`
		}
	}).then(session => {
		cheer.value = session.data.data['cheer-latest'];
		donate.value = session.data.data['tip-latest'];
	});

	const obs = new OBSWebSocket();
	obs.connect(nodecg.bundleConfig.obs);

	function seEventListener(data) {
		switch (data.listener) {
			case 'cheer-latest':
				cheer.value = data.event;
				obs.send('RestartMedia', {sourceName: 'OH O GÁS'});
				break;
			case 'tip-latest':
				donate.value = data.event;
				obs.send('RestartMedia', {sourceName: 'OH O GÁS'});
				break;
		}
	}

	const elements = io('https://realtime.streamelements.com', { transports: ['websocket'] });
	elements.on('connect', () => {
		elements.emit('authenticate', { method: 'jwt', token: nodecg.bundleConfig.streamElements.jwtToken });
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
		const subParams = { broadcaster_user_id: nodecg.bundleConfig.channelId };
		eventSub.getSubscriptions().then(result => {
			result.data.forEach(sub => {
				eventSub.unsubscribe(sub.id);
			});
		});
		eventSub.on('channel.follow', event => {
			follower.value = event.user_name;
			obs.send('RestartMedia', {sourceName: 'Wololo'});
		});
		eventSub.on('channel.subscription.message', event => {
			subscriber.value = event;
			console.log(event);
			obs.send('RestartMedia', {sourceName: 'Heavy Metal'});
		});
		eventSub.on('channel.channel_points_custom_reward_redemption.add', event => {
			const sourceName = nodecg.bundleConfig.rewardMedia[event.reward.title];
			if (sourceName) {
				obs.send('RestartMedia', { sourceName });
			}
		});
		eventSub.on('channel.raid', event => {
			raid.value = event;
			obs.send('RestartMedia', {sourceName: 'AAAAAAAA'});
		});
		eventSub.subscribe('channel.follow', subParams);
		eventSub.subscribe('channel.subscription.message', subParams);
		eventSub.subscribe('channel.channel_points_custom_reward_redemption.add', subParams);
		eventSub.subscribe('channel.raid', { to_broadcaster_user_id: nodecg.bundleConfig.channelId });
	});
};
