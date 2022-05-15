document.addEventListener('DOMContentLoaded', () => {
  const player = document.getElementById('player');
  
  player.onended = e => {
    player.removeAttribute('src');
    player.load();
    nodecg.sendMessage('play-ended');
  };
  
  nodecg.listenFor('play-start', fileName => {
    player.src = `media/${fileName}`;
    player.play();
  });
});
