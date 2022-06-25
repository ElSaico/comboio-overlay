const fs = require('fs');
const process = require('process');

const api = require('@twurple/api');
const auth = require('@twurple/auth');
const chat = require('@twurple/chat');
const eventSub = require('@twurple/eventsub');

const express = require('express');
const iconv = require('iconv-lite');
const modernAsync = require('modern-async');

const autoShDelay = 5000;
const autoMessageInterval = 10*60000;

function displayUser(name, login, anonymous) {
  if (anonymous) return '???';
  return /[\p{ASCII}]+/u.test(name) ? name : login;
}

function pluralize(amount, singular, plural) {
  return amount === 1 ? `${amount} ${singular}` : `${amount} ${plural}`;
}

/*
 * Our Metro font only supports Latin-1 characters, thus some UTF-8 characters
 * (i.e. U+2212 Minus Sign, which appears in some game names - thanks Twitch!)
 * need to get coerced accordingly
 */
function latinize(text) {
  const buffer = iconv.encode(text, 'iso-8859-1');
  return iconv.decode(buffer, 'iso-8859-1');
}

module.exports = nodecg => {
  const config = nodecg.bundleConfig;
  const tokens = nodecg.Replicant('tokens');
  const counters = nodecg.Replicant('counters');
  const secretCount = nodecg.Replicant('secret-counters');

  const follower = nodecg.Replicant('follower');
  const subscriber = nodecg.Replicant('subscriber');
  const cheer = nodecg.Replicant('cheer');
  const mediaFiles = nodecg.Replicant('media-files');
  const track = nodecg.Replicant('track');

  Object.keys(config.secret).forEach(key => {
    if (config.secret[key].counter && !Number.isInteger(secretCount.value[key])) {
      secretCount.value[key] = 0;
    }
  });

  fs.readdir('bundles/comboio-overlay/graphics/media', (err, files) => {
    mediaFiles.value = files;
  });

  const userAuthProvider = new auth.RefreshingAuthProvider(
    {
      clientId: config.twitchApp.id,
      clientSecret: config.twitchApp.secret,
      onRefresh: data => tokens.value = data
    },
    tokens.value
  );
  const userApiClient = new api.ApiClient({ authProvider: userAuthProvider });
  userApiClient.users.getFollows({ followedUser: config.channel.id, limit: 1 })
    .then(response => {
      nodecg.log.info('Initializing follow via Twitch Helix API');
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
      tee: true,
      user_name: data.from_name,
      title: `Doação de ${data.amount} enviada para o Comboio`,
      message: data.message
    });
    //donate.value = `${data.from_name} (${data.amount})`;
    res.status(200).end();
  });
  webhook.post('/tipa', express.json(), (req, res) => {
    if (req.get('X-Tipa-Webhook-Secret-Token') !== config.webhook.tipa) {
      res.status(404).end();
      return;
    }
    const tip = req.body.payload.tip;
    const amount = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(tip.amount);
    nodecg.sendMessage('alert', {
      tee: true,
      user_name: tip.name,
      title: `Pix de ${amount} enviado para o Comboio`,
      message: tip.message
    });
    //donate.value = `${tip.name} (${amount})`;
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
      nodecg.log.info('Twitch EventSub ready for follows and redemptions');
      listener.subscribeToStreamOnlineEvents(config.channel.id, event => {
        autoMessages.start();
      });
      listener.subscribeToStreamOfflineEvents(config.channel.id, event => {
        autoMessages.stop();
      });
      listener.subscribeToChannelFollowEvents(config.channel.id, event => {
        follower.value = displayUser(event.userDisplayName, event.userName);
        nodecg.sendMessage('alert', {
          tee: true,
          user_name: follower.value,
          title: 'Novo passageiro no Comboio'
        });
      });
      listener.subscribeToChannelRedemptionAddEvents(config.channel.id, event => {
        if (event.rewardTitle === config.tts.reward) {
          nodecg.sendMessage('alert', { message: event.input });
        } else if (config.rewards[event.rewardTitle]) {
          const reward = config.rewards[event.rewardTitle];
          if (reward.source) {
            nodecg.sendMessage('play', reward.source);
          }
          if (reward.countdown) {
            nodecg.sendMessage('countdown', [event.rewardTitle, reward]);
          }
        }
      });
    });
  });

  const chatClient = new chat.ChatClient({
    channels: [config.channel.name],
    authProvider: userAuthProvider
  });
  chatClient.connect();

  let autoMessageIdx = 0;
  const autoMessages = new modernAsync.Scheduler(async () => {
    const [username, message] = config.sh[autoMessageIdx++ % config.sh.length];
    chatClient.say(config.channel.name, `!sh ${username} - ${message} #ComboioRecomenda`);
    sh(config.channel.name, username);
  }, autoMessageInterval);
  function handleCommand(channel, message, privmsg, name, command) {
    if (command.alias) {
      command = config.commands[command.alias];
    }
    if (command.enabled === false) {
      return;
    }
    if (command.play) {
      nodecg.sendMessage('play', command.play);
    }
    if (command.counter) {
      // we assume the counter key only applies to secret commands
      chatClient.say(channel, command.counter.replace('####', ++secretCount.value[name]));
    }
    if (command.input) {
      chatClient.say(channel, command.input.replace('####', message.split(' ')[1]));
    }
    if (command.reply) {
      chatClient.say(channel, command.reply, { replyTo: privmsg });
    }
    if (command.message) {
      chatClient.say(channel, command.message);
    }
  }
  async function sh(channel, username) {
    const user = await userApiClient.users.getUserByName(username);
    const userChannel = await userApiClient.channels.getChannelInfo(user);
    nodecg.sendMessage('alert', {
      title: 'O Comboio do Saico recomenda este canal',
      user_name: displayUser(userChannel.displayName, userChannel.name),
      game: latinize(userChannel.gameName)
    });
    chatClient.say(channel, `Recomendação do Comboio: https://twitch.tv/${userChannel.name}, que estava em ${userChannel.gameName} - siga você também!`);
  }
  chatClient.onMessage(async (channel, user, message, privmsg) => {
    if (privmsg.isCheer) {
      const username = displayUser(privmsg.userInfo.displayName, user);
      nodecg.sendMessage('alert', {
        tee: true,
        user_name: username,
        title: `${pluralize(privmsg.bits, 'bit enviado', 'bits enviados')} para o Comboio`,
        message: message
      });
      cheer.value = `${username} (${privmsg.bits})`;
    } else if (message.startsWith('!')) {
      const args = message.slice(1).split(' ');
      let command = args.shift().toLowerCase();
      if (command === 'comandos') {
        chatClient.say(channel, `Comandos disponíveis: !sh !contadores ${Object.keys(config.commands).map(command => '!'+command).join(' ')}`);
      } else if (command === 'contadores') {
        counters.value
          .filter(counter => counter.show)
          .forEach(counter => {
            chatClient.say(channel, `!${counter.command} - ${counter.description}`, { replyTo: privmsg });
          });
      } else if (command === 'sh') {
        if (privmsg.userInfo.isBroadcaster || privmsg.userInfo.isMod) {
          sh(channel, args[0]);
        }
      } else if (config.secret[command]) {
        handleCommand(channel, message, privmsg, command, config.secret[command]);
      } else if (config.commands[command]) {
        handleCommand(channel, message, privmsg, command, config.commands[command]);
      } else {
        const counter = counters.value.find(counter => counter.command === command);
        if (counter && counter.show) {
          counter.count++;
          if (counter.message) {
            chatClient.say(channel, counter.message.replace('####', counter.count));
          }
          if (counter.play) {
            nodecg.sendMessage('play', counter.play);
          }
        }
      }
    }
  });

  function onSub(channel, user, info, notice) {
    subscriber.value = displayUser(info.displayName, user);
    nodecg.sendMessage('alert', {
      tee: true,
      user_name: subscriber.value,
      title: `Passe adquirido, somando ${pluralize(info.months, 'mês', 'meses')}`,
      message: info.message
    });
  }
  chatClient.onSub(onSub);
  chatClient.onResub(onSub);
  chatClient.onBan((channel, user) => {
    nodecg.sendMessage('play', 'banido.mp4');
  });
  chatClient.onRaid((channel, user, info, notice) => {
    nodecg.sendMessage('alert', {
      tee: true,
      user_name: displayUser(info.displayName, user),
      title: `Embarque de uma raid com ${pluralize(info.viewerCount, 'pessoa', 'pessoas')}`
    });
  });
  nodecg.listenFor('chat', message => {
    chatClient.say(config.channel.name, message);
  });
};
