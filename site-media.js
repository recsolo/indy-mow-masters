(() => {
  "use strict";

  const preferenceKey = "indy-mow-masters-site-music";
  const positionKey = "indy-mow-masters-music-position";

  function read(key) {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function write(key, value) {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // Playback can still be controlled on this page.
    }
  }

  const music = new Audio("/rook/site-theme.mp3");
  music.loop = true;
  music.preload = "none";
  let enabled = read(preferenceKey) === "on";
  let playbackAttempt = 0;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "site-music-toggle";
  document.body.append(button);

  function updateButton() {
    const playing = !music.paused;
    button.textContent = playing ? "Pause site music" : "Play site music";
    button.setAttribute("aria-pressed", String(playing));
  }

  function savePosition() {
    if (music.readyState > 0) {
      write(positionKey, String(music.currentTime));
    }
  }

  function hasSoundtrack(video) {
    return video instanceof HTMLVideoElement && !video.classList.contains("rook-promo__video");
  }

  function promoIsPlaying() {
    return [...document.querySelectorAll("video")].filter(hasSoundtrack).some(video =>
      !video.paused && !video.ended
    );
  }

  async function resumeMusic() {
    if (!enabled || promoIsPlaying() || document.hidden) return;

    const attempt = ++playbackAttempt;
    try {
      await music.play();
      if (attempt === playbackAttempt && (!enabled || promoIsPlaying() || document.hidden)) {
        music.pause();
      }
    } catch {
      // Some browsers require a fresh tap after a full page navigation.
      updateButton();
    }
  }

  function pauseMusic() {
    ++playbackAttempt;
    savePosition();
    music.pause();
  }

  music.addEventListener("loadedmetadata", () => {
    const position = Number(read(positionKey));
    if (position > 0 && Number.isFinite(music.duration) && music.duration > 0) {
      music.currentTime = position % music.duration;
    }
  });

  music.addEventListener("play", updateButton);
  music.addEventListener("pause", updateButton);

  button.addEventListener("click", () => {
    enabled = music.paused;
    write(preferenceKey, enabled ? "on" : "off");
    if (enabled) {
      [...document.querySelectorAll("video")].filter(hasSoundtrack).forEach(video => video.pause());
      void resumeMusic();
    } else {
      pauseMusic();
    }
  });

  document.addEventListener("play", event => {
    if (hasSoundtrack(event.target)) pauseMusic();
  }, true);

  function resumeAfterVideo(event) {
    if (hasSoundtrack(event.target)) void resumeMusic();
  }

  document.addEventListener("pause", resumeAfterVideo, true);
  document.addEventListener("ended", resumeAfterVideo, true);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseMusic();
    else void resumeMusic();
  });
  window.addEventListener("pagehide", pauseMusic);
  window.addEventListener("pageshow", event => {
    if (!event.persisted) return;
    enabled = read(preferenceKey) === "on";
    const position = Number(read(positionKey));
    if (Number.isFinite(music.duration) && music.duration > 0) {
      music.currentTime = position % music.duration;
    }
    updateButton();
    void resumeMusic();
  });
  updateButton();
  void resumeMusic();
})();
