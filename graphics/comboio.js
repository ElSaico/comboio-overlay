import '../node_modules/obs-websocket-js/dist/obs-websocket.min.js';
import '../node_modules/modern-async/dist/modern-async.umd.js';
import '../node_modules/microsoft-cognitiveservices-speech-sdk/distrib/browser/microsoft.cognitiveservices.speech.sdk.bundle-min.js';
import { Duration } from '../node_modules/luxon/build/es6/luxon.js';
import { $Font } from '../node_modules/bdfparser/dist/esm/bdfparser.js';
import fetchline from '../node_modules/fetchline/dist/esm/index.js';

import LEDPanel from './led.js';

const follower = nodecg.Replicant('follower');
const subscriber = nodecg.Replicant('subscriber');
const cheer = nodecg.Replicant('cheer');
const goal = nodecg.Replicant('goal');
const track = nodecg.Replicant('track');
const counters = nodecg.Replicant('counters');

const config = nodecg.bundleConfig;
const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(config.tts.speechKey, config.tts.region);
speechConfig.speechSynthesisVoiceName = config.tts.voiceName;
const tee = new Audio("media/tee.ogg");
tee.volume = 0.5;
const eventQueue = new modernAsync.Queue(1);
const timerQueue = new modernAsync.Queue(1);
const obs = new OBSWebSocket();
let mediaLock;

obs.connect(config.obs);

function toggleFilters(filters, enabled) {
  if (filters) {
    for (const filter of filters) {
      obs.send('SetSourceFilterVisibility', {
        sourceName: filter.source,
        filterName: filter.name,
        filterEnabled: enabled
      });
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const panelFollower = new LEDPanel(document.getElementById('display-follower'), {x: 80, y: 8}, {x: 4, y: 5});
  const panelSubscriber = new LEDPanel(document.getElementById('display-subscriber'), {x: 80, y: 8}, {x: 4, y: 5});
  const panelCheer = new LEDPanel(document.getElementById('display-cheer'), {x: 80, y: 8}, {x: 4, y: 5});
  const panelGoal = new LEDPanel(document.getElementById('display-goal'), {x: 80, y: 8}, {x: 4, y: 5});
  const panelAlerts = new LEDPanel(document.getElementById('alerts'), {x: 200, y: 8}, {x: 4, y: 5});
  const panelCounters = [1, 2, 3].map(i => new LEDPanel(document.getElementById(`counter${i}`), {x: 130, y: 8}, {x: 4, y: 5}));
  const ibmFont = await $Font(fetchline('fonts/ibm8x8.bdf'));
  const thinFont = await $Font(fetchline('fonts/metro.bdf'));
  const commandMedia = document.getElementById('command-media');
  let alertLock = false;
  let idleIdx = 0;
  const idleAlertBar = new modernAsync.Scheduler(async () => {
    panelAlerts.drawCentered(thinFont.draw(config.idle[idleIdx++ % config.idle.length]), '#bfff00');
  }, 5000);

  function resetAlertBar(track) {
    idleAlertBar.stop();
    if (!alertLock && timerQueue.running === 0) {
      if (track) {
        panelAlerts.drawLoopable(thinFont, track, '#bfff00', 50);
      } else {
        idleAlertBar.start();
      }
    }
  }

  commandMedia.onended = e => {
    commandMedia.removeAttribute('src');
    commandMedia.load();
    if (mediaLock) {
      mediaLock.resolve();
      mediaLock = null;
    }
  };

  follower.on('change', value => {
    panelFollower.drawLoopable(thinFont, value, '#bfff00', 100);
  });

  subscriber.on('change', value => {
    panelSubscriber.drawLoopable(thinFont, value, '#bfff00', 100);
  });

  cheer.on('change', value => {
    panelCheer.drawLoopable(thinFont, value, '#bfff00', 100);
  });

  goal.on('change', value => {
    panelGoal.drawLoopable(thinFont, value, '#bfff00', 100);
  });

  track.on('change', value => {
    resetAlertBar(value);
  });

  nodecg.listenFor('play', fileName => {
    eventQueue.exec(async () => {
      mediaLock = new modernAsync.Deferred();
      commandMedia.src = `media/${fileName}`;
      commandMedia.play();
      await mediaLock.promise;
    });
  });

  nodecg.listenFor('alert', value => {
    eventQueue.exec(async () => {
      idleAlertBar.stop();
      alertLock = true;
      let delay = 0;
      if (value.tee) {
        tee.play();
        delay = 9000;
      }
      const tts = new SpeechSDK.SpeechSynthesizer(speechConfig);
      if (value.title) {
        setTimeout(() => tts.speakTextAsync(value.title), delay);
        await panelAlerts.drawScroll(ibmFont, value.title, '#ff9900', 25);
      }
      if (value.user_name) {
        setTimeout(() => tts.speakTextAsync(value.user_name), 500);
        await panelAlerts.drawAnimatedVertical(thinFont, value.user_name, '#bfff00', 250);
      }
      if (value.game) {
        await new Promise(cb => setTimeout(cb, 1000));
        setTimeout(() => tts.speakTextAsync(value.game), 500);
        await panelAlerts.drawAnimatedHorizontal(thinFont, value.game, '#bfff00', 50);
      }
      if (value.message) {
        setTimeout(() => tts.speakTextAsync(value.message), 250);
        await panelAlerts.drawScroll(ibmFont, value.message, '#ff9900', 25);
      }
      tts.close();
    }).then(() => {
      alertLock = false;
      resetAlertBar(track.value);
    });
  });

  nodecg.listenFor('countdown', ([title, reward]) => {
    timerQueue.exec(async () => {
      toggleFilters(reward.filters, true);
      for (let duration = Duration.fromMillis(reward.countdown*1000); duration.valueOf() >= 0; duration = duration.minus(1000)) {
        if (!alertLock) {
          panelAlerts.drawLoopable(ibmFont, `${title}: ${duration.toFormat('mm:ss')}`, '#ff9900', 25);
        }
        await modernAsync.sleep(1000);
      }
      toggleFilters(reward.filters, false);
    }).then(() => {
      resetAlertBar(track.value);
    });
  });

  counters.on('change', value => {
    const visible = value.filter(counter => counter.show);
    for (let i = 0; i < 3; ++i) {
      const label = visible[i] ? `!${visible[i].command.padEnd(10)} ${visible[i].count.toString().padStart(4)}` : '';
      panelCounters[i].drawLoopable(ibmFont, label, '#ff9900');
    }
  });
});
