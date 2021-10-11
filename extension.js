const process = require('process');

const axios = require('axios');
const OBSWebSocket = require('obs-websocket-js');
const ngrok = require('ngrok');
const TES = require('tesjs');
const tmi = require('tmi.js');
const discordjs = require('discord.js');

const autoShDelay = 5000;

function displayUser(name, login, anonymous) {
	if (anonymous) return '???';
	return /[\p{ASCII}]+/u.test(name) ? name : login;
}

module.exports = nodecg => {
	const config = nodecg.bundleConfig;
	const follower = nodecg.Replicant('follower');
	const subscriber = nodecg.Replicant('subscriber');
	const cheer = nodecg.Replicant('cheer');
	const track = nodecg.Replicant('track');

	axios.get(`https://api.twitch.tv/helix/users/follows?to_id=${config.channelId}`, {
		headers: {
			Authorization: `Bearer ${config.twitchApp.token}`,
			'Client-Id': config.twitchApp.id
		}
	}).then(response => {
		nodecg.log.debug('Initializing follow via Twitch Helix API');
		const data = response.data.data[0];
		follower.value = displayUser(data.from_name, data.from_login);
	}).catch(err => {
		nodecg.log.error('Error on calling Twitch Helix API:', err.response.data);
		process.exit(1);
	});

	const obs = new OBSWebSocket();
	obs.connect(config.obs)
		.catch(err => {
			nodecg.log.error('Error on connecting to OBS:', err);
			process.exit(1);
		});

	ngrok.connect({ addr: config.eventSub.port, authtoken: config.ngrok.authToken }).then(url => {
		nodecg.log.info('ngrok connected:', url);
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
		// TODO queue up events
		eventSub.on('channel.follow', event => {
			nodecg.log.debug('received channel.follow:', event);
			follower.value = displayUser(event.user_name, event.user_login);
			nodecg.sendMessage('alert', {
				user_name: follower.value,
				message: 'Novo passageiro no Comboio'
			});
			obs.send('RestartMedia', {sourceName: 'Wololo'});
		});
		eventSub.on('channel.subscription.message', event => {
			nodecg.log.debug('received channel.subscription.message:', event);
			event.user_name = displayUser(event.user_name, event.user_login);
			nodecg.sendMessage('alert', {
				user_name: event.user_name,
				message: `Novo passe adquirido, totalizando ${event.cumulative_months} meses`
			});
			subscriber.value = event;
			obs.send('RestartMedia', {sourceName: 'Heavy Metal'});
		});
		eventSub.on('channel.cheer', event => {
			nodecg.log.debug('received channel.cheer:', event);
			event.user_name = displayUser(event.user_name, event.user_login, event.is_anonymous);
			nodecg.sendMessage('alert', {
				user_name: event.user_name,
				message: `${event.bits} bits enviados para o Comboio`
			});
			cheer.value = event;
			obs.send('RestartMedia', {sourceName: 'OH O GÁS'});
		});
		eventSub.on('channel.channel_points_custom_reward_redemption.add', event => {
			nodecg.log.debug('received channel.channel_points_custom_reward_redemption.add:', event);
			const sourceName = config.rewardMedia[event.reward.title];
			if (sourceName) {
				obs.send('RestartMedia', { sourceName });
			}
		});
		eventSub.on('channel.raid', event => {
			nodecg.log.debug('received channel.raid:', event);
			event.from_broadcaster_user_name = displayUser(event.from_broadcaster_user_name, event.from_broadcaster_user_login);
			nodecg.sendMessage('alert', {
				user_name: event.from_broadcaster_user_name,
				message: `Recebendo uma raid com ${event.viewers} pessoas`
			});
			obs.send('RestartMedia', {sourceName: 'AAAAAAAA'});
		});
		eventSub.subscribe('channel.follow', subParams);
		eventSub.subscribe('channel.subscribe', subParams);
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
		channels: [ config.chat.channel ]
	});
	chat.connect();
	chat.on('message', (channel, tags, message, self) => {
		if (self || !message.startsWith('!')) return;
		const args = message.slice(1).split(' ');
		const command = args.shift().toLowerCase();
		const counter = nodecg.readReplicant('counters').find(counter => counter.command === command);
		if (counter && counter.show) {
			counter.count++;
			if (counter.message) {
				chat.say(channel, counter.message.replace('####', counter.count));
			}
		}
	});

	const discord = new discordjs.Client({ intents: [discordjs.Intents.FLAGS.GUILDS, discordjs.Intents.FLAGS.GUILD_MESSAGES] });
	discord.once('ready', () => {
		nodecg.log.info('Discord bot is up and running');
		track.value = ' '; // TODO set to null and handle properly in LEDPanel instead
	});
	discord.on('messageCreate', message => {
		if (message.author.id === config.discord.hydraId && message.embeds.length > 0 && message.embeds[0].title === 'Tocando agora') {
			const nowPlaying = message.embeds[0].description;
			track.value = nowPlaying;
			if (config.discord.autoSh[nowPlaying]) {
				nodecg.log.info('AutoPimba identified:', config.discord.autoSh[nowPlaying]);
				setTimeout(() => chat.say(config.chat.channel, `!sh ${config.discord.autoSh[nowPlaying]} #autopimba`), autoShDelay);
			}
		}
	});
	discord.login(config.discord.token);
};
