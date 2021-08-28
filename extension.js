const axios = require('axios');
const OBSWebSocket = require('obs-websocket-js');
const io = require('socket.io-client');
const ngrok = require('ngrok');
const TES = require('tesjs');
const tmi = require('tmi.js');

function displayUser(name, login, anonymous) {
	if (anonymous) return '???';
	return /[\p{ASCII}]+/u.test(name) ? name : login;
}

module.exports = nodecg => {
	const follower = nodecg.Replicant('follower');
	const subscriber = nodecg.Replicant('subscriber');
	const cheer = nodecg.Replicant('cheer');
	const donate = nodecg.Replicant('donate');
	const raid = nodecg.Replicant('raid');
	const meudeus = nodecg.Replicant('meudeus');
	let meudeusNow = 0;

	axios.get(`https://api.twitch.tv/helix/users/follows?to_id=${nodecg.bundleConfig.channelId}`, {
		headers: {
			Authorization: `Bearer ${nodecg.bundleConfig.twitchApp.token}`,
			'Client-Id': nodecg.bundleConfig.twitchApp.id
		}
	}).then(response => {
		const data = response.data.data[0];
		follower.value = displayUser(data.from_name, data.from_login);
	});
	axios.get(`https://api.streamelements.com/kappa/v2/activities/${nodecg.bundleConfig.streamElements.channelId}?types=cheer`, {
		headers: {
			Authorization: `Bearer ${nodecg.bundleConfig.streamElements.jwtToken}`
		}
	}).then(response => {
		const data = response.data[0].data;
		cheer.value = {
			// TODO is that how we check for anonymous cheers?
			name: displayUser(data.displayName, data.username, !data.providerId),
			amount: data.amount
		};
	});
	// TODO fetch latest tip

	const obs = new OBSWebSocket();
	obs.connect(nodecg.bundleConfig.obs);

	const elements = io('https://realtime.streamelements.com', { transports: ['websocket'] });
	elements.on('connect', () => {
		elements.emit('authenticate', { method: 'jwt', token: nodecg.bundleConfig.streamElements.jwtToken });
	});
	elements.on('event', data => {
		if (data.listener === 'tip-latest') {
			donate.value = data.event;
			obs.send('RestartMedia', {sourceName: 'OH O GÁS'});
		}
	});

	ngrok.connect(nodecg.bundleConfig.eventSub.port).then(url => {
		console.log('ngrok connected:', url);
		const eventSub = new TES({
			identity: nodecg.bundleConfig.twitchApp,
			listener: {
				baseURL: url,
				port: nodecg.bundleConfig.eventSub.port,
				secret: nodecg.bundleConfig.eventSub.secret
			}
		});
		const subParams = { broadcaster_user_id: nodecg.bundleConfig.channelId };
		eventSub.getSubscriptions().then(result => {
			result.data.forEach(sub => {
				eventSub.unsubscribe(sub.id);
			});
		});
		eventSub.on('channel.follow', event => {
			follower.value = displayUser(event.user_name, event.user_login);
			obs.send('RestartMedia', {sourceName: 'Wololo'});
		});
		eventSub.on('channel.subscription.message', event => {
			subscriber.value = event;
			// TODO check for non-ASCII display names
			obs.send('RestartMedia', {sourceName: 'Heavy Metal'});
		});
		eventSub.on('channel.cheer', event => {
			cheer.value = {
				name: displayUser(event.user_name, event.user_login, event.is_anonymous),
				amount: event.bits
			};
			obs.send('RestartMedia', {sourceName: 'OH O GÁS'});
		});
		eventSub.on('channel.channel_points_custom_reward_redemption.add', event => {
			const sourceName = nodecg.bundleConfig.rewardMedia[event.reward.title];
			if (sourceName) {
				obs.send('RestartMedia', { sourceName });
			}
		});
		eventSub.on('channel.raid', event => {
			raid.value = event;
			// TODO check for non-ASCII display names
			obs.send('RestartMedia', {sourceName: 'AAAAAAAA'});
		});
		eventSub.subscribe('channel.follow', subParams);
		eventSub.subscribe('channel.subscription.message', subParams);
		eventSub.subscribe('channel.cheer', subParams);
		eventSub.subscribe('channel.channel_points_custom_reward_redemption.add', subParams);
		eventSub.subscribe('channel.raid', { to_broadcaster_user_id: nodecg.bundleConfig.channelId });
	});

	const chat = new tmi.Client({
		connection: {
			reconnect: true,
			secure: true
		},
		identity: nodecg.bundleConfig.chat,
		channels: [ nodecg.bundleConfig.chat.username ]
	});
	chat.connect();
	chat.on('message', (channel, tags, message, self) => {
		if (self || !message.startsWith('!')) return;
		const args = message.slice(1).split(' ');
		const command = args.shift().toLowerCase();

		if (command === 'meudeus') { // hardcoding this to make it work ASAP
			meudeus.value++;
			meudeusNow++;
			chat.say(channel, `Meu Deus! Já são ${meudeus.value} comentários infames nas lives do Comboio, incluindo ${meudeusNow} só nesta!`);
		}
	});
};
