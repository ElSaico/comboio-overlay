const process = require('process');

const api = require('@twurple/api');
const auth = require('@twurple/auth');
const chat = require('@twurple/chat');
const eventSub = require('@twurple/eventsub');

const express = require('express');
const discordjs = require('discord.js');

const autoShDelay = 5000;

function displayUser(name, login, anonymous) {
    if (anonymous) return '???';
    return /[\p{ASCII}]+/u.test(name) ? name : login;
}

function pluralize(amount, singular, plural) {
    return amount === 1 ? `${amount} ${singular}` : `${amount} ${plural}`;
}

module.exports = nodecg => {
    const config = nodecg.bundleConfig;
    const tokens = nodecg.Replicant('tokens');

    const follower = nodecg.Replicant('follower');
    const subscriber = nodecg.Replicant('subscriber');
    const cheer = nodecg.Replicant('cheer');
    const donate = nodecg.Replicant('donate');
    const track = nodecg.Replicant('track');
    track.value = null;

    const userAuthProvider = new auth.RefreshingAuthProvider(
        {
            clientId: config.twitchApp.id,
            clientSecret: config.twitchApp.secret,
            onRefresh: data => tokens.value = data
        },
        tokens.value
    );
    const userApiClient = new api.ApiClient({ authProvider: userAuthProvider });
    userApiClient.users.getFollows({
        followedUser: config.channel.id,
        limit: 1
    }).then(response => {
        nodecg.log.debug('Initializing follow via Twitch Helix API');
        follower.value = displayUser(response.data[0].userDisplayName, response.data[0].userName);
    }).catch(err => {
        nodecg.log.error('Error on calling Twitch Helix API:', err.body);
    });

    const webhook = express();
    webhook.use(express.urlencoded());
    webhook.use((req, res, next) => {
        res.set('X-Clacks-Overhead', 'GNU Terry Pratchett');
        next();
    });
    webhook.post('/ko-fi', (req, res) => {
        const data = JSON.parse(req.body.data);
        if (!data.is_public) {
            data.from_name = '???';
        }
        data.amount = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: data.currency }).format(data.amount);
        nodecg.sendMessage('alert', {
            user_name: data.from_name,
            title: `Doação de ${data.amount} enviada para o Comboio`,
            message: data.message
        });
        donate.value = `${data.from_name} (${data.amount})`;
        res.status(200).end();
    });

    const appAuthProvider = new auth.ClientCredentialsAuthProvider(config.twitchApp.id, config.twitchApp.secret);
    const appApiClient = new api.ApiClient({ authProvider: appAuthProvider });
    const listener = new eventSub.EventSubMiddleware({
        apiClient: appApiClient,
        hostName: config.eventSub.hostname,
        pathPrefix: '/twitch',
        secret: config.eventSub.secret
    });

    listener.apply(webhook).then(() => {
        webhook.listen(config.eventSub.port, async () => {
            await listener.markAsReady();
            listener.subscribeToChannelFollowEvents(config.channel.id, event => {
                follower.value = displayUser(event.userDisplayName, event.userName);
                nodecg.sendMessage('alert', {
                    user_name: follower.value,
                    title: 'Novo passageiro no Comboio'
                });
            });
            listener.subscribeToChannelRedemptionAddEvents(config.channel.id, event => {
                if (event.rewardTitle === config.tts.reward) {
                    nodecg.sendMessage('alert', { message: event.input });
                } else {
                    const sourceName = config.rewardMedia[event.rewardTitle];
                    if (sourceName) {
                        nodecg.sendMessage('play', sourceName);
                    }
                }
            });
        });
    });

    const chatSettings = {
        channels: [ config.channel.name ]
    };
    if (process.env.MOCK_CHAT) {
        nodecg.log.info('Running in mock (fgdt) mode');
        chatSettings.hostName = 'irc.fdgt.dev';
        chatSettings.webSocket = false;
        chatSettings.ssl = false; // we could add the Let's Encrypt intermediate cert to Node instead, but ehhhhh
    } else {
        chatSettings.authProvider = userAuthProvider;
    }
    const chatClient = new chat.ChatClient(chatSettings);
    chatClient.connect();
    chatClient.onMessage((channel, user, message, privmsg) => {
        if (privmsg.isCheer) {
            const username = displayUser(privmsg.userInfo.displayName, user);
            nodecg.sendMessage('alert', {
                user_name: username,
                title: `${pluralize(privmsg.bits, 'bit enviado', 'bits enviados')} para o Comboio`,
                message: message
            });
            cheer.value = `${username} (${privmsg.bits})`;
        } else if (message.startsWith('!')) {
            const args = message.slice(1).split(' ');
            let command = args.shift().toLowerCase();
            if (command === 'comandos') {
                chatClient.say(channel, `Comandos disponíveis: ${Object.keys(config.commands).map(command => '!'+command).join(' ')}`);
            } else if (config.commands[command]) {
                if (config.commands[command].alias) {
                    command = config.commands[command].alias;
                }
                if (config.commands[command].reply) {
                    chatClient.say(channel, config.commands[command].reply, { replyTo: privmsg });
                }
                if (config.commands[command].message) {
                    chatClient.say(channel, config.commands[command].message);
                }
            } else {
                const counter = nodecg.readReplicant('counters').find(counter => counter.command === command);
                if (counter && counter.show) {
                    counter.count++;
                    if (counter.message) {
                        chatClient.say(channel, counter.message.replace('####', counter.count));
                    }
                }
            }
        }
    });
    chatClient.onSub((channel, user, info, notice) => {
        subscriber.value = displayUser(info.displayName, user);
        nodecg.sendMessage('alert', {
            user_name: subscriber.value,
            title: `Passe adquirido, totalizando ${pluralize(info.months, 'mês', 'meses')}`,
            message: info.message
        });
    });
    chatClient.onRaid((channel, user, info, notice) => {
        nodecg.sendMessage('alert', {
            user_name: displayUser(info.displayName, user),
            title: `Recebendo uma raid com ${pluralize(info.viewerCount, 'pessoa', 'pessoas')}`
        });
    });
    nodecg.listenFor('chat', message => {
        chatClient.say(config.channel.name, message);
    });

    const discord = new discordjs.Client({ intents: [discordjs.Intents.FLAGS.GUILDS, discordjs.Intents.FLAGS.GUILD_MESSAGES] });
    discord.once('ready', () => {
        nodecg.log.info('Discord bot is up and running');
        discord.channels.cache.get(config.discord.channelId).messages.fetch(config.discord.playerMessageId);
    });
    discord.on('messageUpdate', (oldMessage, newMessage) => {
        if (newMessage.id === config.discord.playerMessageId) {
            if (newMessage.embeds[0].title === 'Nenhuma música sendo reproduzida no momento') {
                track.value = null;
            } else {
                const [duration, ...titleRest] = newMessage.embeds[0].title.split(' - ');
                const nowPlaying = titleRest.join(' - ');
                track.value = nowPlaying;
                if (config.discord.autoSh[nowPlaying]) {
                    nodecg.log.info('AutoPimba identified:', config.discord.autoSh[nowPlaying]);
                    setTimeout(() => chatClient.say(config.channel.name, `!sh ${config.discord.autoSh[nowPlaying]} #autopimba`), autoShDelay);
                }
            }
        }
    });
    discord.login(config.discord.token);
};
