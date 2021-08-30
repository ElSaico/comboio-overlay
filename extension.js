const axios = require('axios');
const OBSWebSocket = require('obs-websocket-js');
const io = require('socket.io-client');
const ngrok = require('ngrok');
const TES = require('tesjs');
const tmi = require('tmi.js');
const open = require('open');
const SpotifyWebApi = require('spotify-web-api-node');

function displayUser(name, login, anonymous) {
	if (anonymous) return '???';
	return /[\p{ASCII}]+/u.test(name) ? name : login;
}

module.exports = nodecg => {
	const config = nodecg.bundleConfig;
	const follower = nodecg.Replicant('follower');
	const subscriber = nodecg.Replicant('subscriber');
	const cheer = nodecg.Replicant('cheer');
	const donate = nodecg.Replicant('donate');
	const raid = nodecg.Replicant('raid');
	const track = nodecg.Replicant('track');
	const meudeus = nodecg.Replicant('meudeus');
	let meudeusNow = 0;

	axios.get(`https://api.twitch.tv/helix/users/follows?to_id=${config.channelId}`, {
		headers: {
			Authorization: `Bearer ${config.twitchApp.token}`,
			'Client-Id': config.twitchApp.id
		}
	}).then(response => {
		const data = response.data.data[0];
		follower.value = displayUser(data.from_name, data.from_login);
	});
	axios.get(`https://api.streamelements.com/kappa/v2/activities/${config.streamElements.channelId}?types=cheer`, {
		headers: {
			Authorization: `Bearer ${config.streamElements.jwtToken}`
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
	obs.connect(config.obs);

	const elements = io('https://realtime.streamelements.com', { transports: ['websocket'] });
	elements.on('connect', () => {
		elements.emit('authenticate', { method: 'jwt', token: config.streamElements.jwtToken });
	});
	elements.on('event', data => {
		if (data.listener === 'tip-latest') {
			donate.value = data.event;
			obs.send('RestartMedia', {sourceName: 'OH O GÁS'});
		}
	});

	ngrok.connect(config.eventSub.port).then(url => {
		console.log('ngrok connected:', url);
		const eventSub = new TES({
			identity: config.twitchApp,
			listener: {
				baseURL: url,
				port: config.eventSub.port,
				secret: config.eventSub.secret
			}
		});
		const subParams = { broadcaster_user_id: config.channelId };
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
			const sourceName = config.rewardMedia[event.reward.title];
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
		eventSub.subscribe('channel.raid', { to_broadcaster_user_id: config.channelId });
	});

	const chat = new tmi.Client({
		connection: {
			reconnect: true,
			secure: true
		},
		identity: config.chat,
		channels: [ config.chat.username ]
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

	const spotify = new SpotifyWebApi(config.spotify.credentials);
	const router = nodecg.Router();
	router.get('/spotify', async (req, res) => {
		const data = await spotify.authorizationCodeGrant(req.query.code);
		spotify.setAccessToken(data.body.access_token);
		spotify.setRefreshToken(data.body.refresh_token);
		setInterval(async () => {
			const playing = await spotify.getMyCurrentPlayingTrack();
			if (playing.statusCode === 200 && track.value.id !== playing.body.item.id) {
				track.value = playing.body.item;
				console.log(`Now playing: ${track.value.artists.map(artist => artist.name).join(', ')} -  ${track.value.name}`);
				if (config.spotify.autoSh[track.value.id]) {
					console.log('AutoPimba identificada:', config.spotify.autoSh[track.value.id]);
					setTimeout(() => chat.say(config.chat.username, `!sh ${config.spotify.autoSh[track.value.id]} #autopimba`), 5000);
				}
			}
		}, 5000);
		res.send('The pimba is being taken care of; you can close this now');
	});
	nodecg.mount(router);
	open(spotify.createAuthorizeURL(['user-read-currently-playing', 'user-read-playback-state'], config.spotify.state));
};
