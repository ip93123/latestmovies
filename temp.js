
    gsap.registerPlugin(ScrollTrigger);

    // Load YouTube Iframe API lazily — after initial paint, not blocking critical path.
    // Also skipped on Save-Data / slow connections to preserve bandwidth.
    function loadYouTubeAPI() {
      if (isYtApiReady) return;
      const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (conn && (conn.saveData || conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g')) {
        return; // Skip autoplay trailer on slow/metered connections
      }
      const ytTag = document.createElement('script');
      ytTag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(ytTag);
    }
    // Defer until after the browser has finished painting the page
    window.addEventListener('load', () => setTimeout(loadYouTubeAPI, 800), { once: true });

    let ytPlayer = null;
    let isYtApiReady = false;
    // Stores a pending trailer key if setHero ran before the API was ready
    let _pendingTrailerKey = null;

    window.onYouTubeIframeAPIReady = function() {
      isYtApiReady = true;
      // If hero already found a trailer but the API wasn't ready yet, create player now
      if (_pendingTrailerKey) {
        _createHeroPlayer(_pendingTrailerKey);
        _pendingTrailerKey = null;
      }
    };

    // Global helper — creates the YT hero background player from a trailer key
    function _createHeroPlayer(trailerKey) {
      const heroVideo = document.getElementById('heroVideoContainer');
      if (!heroVideo) return;
      // Destroy any existing player first
      if (ytPlayer && typeof ytPlayer.destroy === 'function') {
        ytPlayer.destroy();
        ytPlayer = null;
      }
      heroVideo.innerHTML = `<div id="heroYtPlayer"></div>`;
      const isMuted = localStorage.getItem('hackyMax_trailerMuted') === 'true';
      const muteBtn = document.getElementById('heroMuteBtn');
      if (muteBtn) {
        muteBtn.style.display = 'flex';
        muteBtn.innerHTML = isMuted ? `🔇` : `🔊`;
        muteBtn.onclick = () => {
          if (ytPlayer && ytPlayer.isMuted) {
            if (ytPlayer.isMuted()) {
              ytPlayer.unMute();
              ytPlayer.setVolume(50);
              localStorage.setItem('hackyMax_trailerMuted', 'false');
              muteBtn.innerHTML = `🔊`;
            } else {
              ytPlayer.mute();
              localStorage.setItem('hackyMax_trailerMuted', 'true');
              muteBtn.innerHTML = `🔇`;
            }
          }
        };
      }
      let autoPlayAttempted = false;
      ytPlayer = new YT.Player('heroYtPlayer', {
        videoId: trailerKey,
        playerVars: {
          autoplay: 1, controls: 0, showinfo: 0, rel: 0,
          loop: 1, playlist: trailerKey, modestbranding: 1,
          playsinline: 1, mute: 1
        },
        events: {
          onReady: (e) => {
            e.target.setVolume(50);
            if (!isMuted) {
              autoPlayAttempted = true;
              e.target.unMute();
              setTimeout(() => { autoPlayAttempted = false; }, 2000);
            }
            setTimeout(() => { heroVideo.style.opacity = '0.65'; }, 1500);
          },
          onStateChange: (e) => {
            if (e.data === YT.PlayerState.PAUSED && autoPlayAttempted) {
              e.target.mute();
              e.target.playVideo();
              localStorage.setItem('hackyMax_trailerMuted', 'true');
              if (muteBtn) muteBtn.innerHTML = `🔇`;
            }
          },
          onError: (e) => {
            console.warn('YouTube Player Error:', e.data);
            if (ytPlayer && typeof ytPlayer.destroy === 'function') {
              ytPlayer.destroy();
            }
            document.getElementById('heroVideoContainer').style.opacity = '0';
          }
        }
      });
    }

    const IMG = 'https://image.tmdb.org/t/p/';
    const COUNTRY = 'US';

    function slugify(text) {
      return (text || '').toString().toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
    }

    // Platform direct URLs
    const PLATFORM_URLS = {
      8: 'https://www.netflix.com',
      1796: 'https://www.netflix.com',
      9: 'https://www.amazon.com/prime-video',
      119: 'https://www.amazon.com/prime-video',
      10: 'https://www.amazon.com/video',
      337: 'https://www.disneyplus.com',
      122: 'https://www.disneyplus.com',
      508: 'https://disneynow.com',
      1899: 'https://www.max.com',
      1825: 'https://www.max.com',
      2472: 'https://www.max.com',
      15: 'https://www.hulu.com',
      2: 'https://tv.apple.com',
      350: 'https://tv.apple.com',
      2243: 'https://tv.apple.com',
      531: 'https://www.paramountplus.com',
      582: 'https://www.paramountplus.com',
      633: 'https://www.paramountplus.com',
      187: 'https://www.paramountplus.com',
      386: 'https://www.peacocktv.com',
      387: 'https://www.peacocktv.com',
      283: 'https://www.crunchyroll.com',
      257: 'https://www.fubo.tv',
      37: 'https://www.showtime.com',
      524: 'https://www.discoveryplus.com',
      510: 'https://www.discoveryplus.com',
      526: 'https://www.amcplus.com',
      528: 'https://www.amcplus.com',
      43: 'https://www.starz.com',
      630: 'https://www.starz.com',
      11: 'https://mubi.com',
      73: 'https://tubitv.com',
      3: 'https://play.google.com/store/movies',
      192: 'https://www.youtube.com/movies',
      188: 'https://www.youtube.com/premium',
      235: 'https://www.youtube.com/movies',
      2528: 'https://tv.youtube.com',
      538: 'https://www.plex.tv',
      7: 'https://www.vudu.com',
      332: 'https://www.fandangonow.com',
      1757: 'https://www.mgmplus.com',
      583: 'https://www.mgmplus.com',
      34: 'https://www.mgmplus.com',
      636: 'https://www.mgmplus.com',
      151: 'https://www.britbox.com',
      390: 'https://www.curiositystream.com',
      300: 'https://pluto.tv',
      99: 'https://www.shudder.com',
      87: 'https://acorn.tv',
      207: 'https://therokuchannel.roku.com',
      38: 'https://www.bbc.co.uk/iplayer',
      29: 'https://www.skygo.co.uk',
      39: 'https://www.nowtv.com',
      1773: 'https://www.skyshowtime.com',
      486: 'https://www.spectrum.net/services/tv/streaming',
      2383: 'https://www.philo.com',
      55: 'https://www.showmax.com',
      344: 'https://www.viki.com',
      84: 'https://video.unext.jp',
      237: 'https://www.sonyliv.com',
      457: 'https://www.vix.com',
    };

    // Provider config
    const PROVIDERS = {
      // Netflix
      8: { name: 'Netflix', short: 'NF', cls: 'netflix', color: '#E50914', bg: 'rgba(229,9,20,0.15)', border: 'rgba(229,9,20,0.4)' },
      1796: { name: 'Netflix with Ads', short: 'NF', cls: 'netflix', color: '#E50914', bg: 'rgba(229,9,20,0.15)', border: 'rgba(229,9,20,0.4)' },
      // Amazon
      9: { name: 'Prime Video Alt', short: 'PV', cls: 'prime', color: '#00A8E1', bg: 'rgba(0,168,225,0.15)', border: 'rgba(0,168,225,0.4)' },
      119: { name: 'Prime Video', short: 'PV', cls: 'prime', color: '#00A8E1', bg: 'rgba(0,168,225,0.15)', border: 'rgba(0,168,225,0.4)' },
      10: { name: 'Amazon Video', short: 'AV', cls: 'prime', color: '#00A8E1', bg: 'rgba(0,168,225,0.15)', border: 'rgba(0,168,225,0.4)' },
      533: { name: 'Arthaus', short: 'ART', cls: 'prime', color: '#00A8E1', bg: 'rgba(0,168,225,0.15)', border: 'rgba(0,168,225,0.4)' },
      613: { name: 'Prime Free Ads', short: 'PVF', cls: 'prime', color: '#00A8E1', bg: 'rgba(0,168,225,0.15)', border: 'rgba(0,168,225,0.4)' },
      2100: { name: 'Prime with Ads', short: 'PVA', cls: 'prime', color: '#00A8E1', bg: 'rgba(0,168,225,0.15)', border: 'rgba(0,168,225,0.4)' },
      1898: { name: 'Amazon MX Player', short: 'MX', cls: 'prime', color: '#00A8E1', bg: 'rgba(0,168,225,0.15)', border: 'rgba(0,168,225,0.4)' },
      // Disney
      337: { name: 'Disney+', short: 'D+', cls: 'disney', color: '#6B9FFF', bg: 'rgba(17,60,166,0.15)', border: 'rgba(17,60,166,0.5)' },
      122: { name: 'Disney+ Alt', short: 'D+', cls: 'disney', color: '#6B9FFF', bg: 'rgba(17,60,166,0.15)', border: 'rgba(17,60,166,0.5)' },
      508: { name: 'DisneyNow', short: 'DN', cls: 'disney', color: '#6B9FFF', bg: 'rgba(17,60,166,0.15)', border: 'rgba(17,60,166,0.5)' },
      // HBO / Max
      1899: { name: 'Max', short: 'MAX', cls: 'hbo', color: '#C87FFF', bg: 'rgba(160,32,240,0.15)', border: 'rgba(160,32,240,0.4)' },
      1825: { name: 'Max Amazon', short: 'MAX', cls: 'hbo', color: '#C87FFF', bg: 'rgba(160,32,240,0.15)', border: 'rgba(160,32,240,0.4)' },
      2472: { name: 'Max Amazon Alt', short: 'MAX', cls: 'hbo', color: '#C87FFF', bg: 'rgba(160,32,240,0.15)', border: 'rgba(160,32,240,0.4)' },
      2284: { name: 'Max U-NEXT', short: 'MAX', cls: 'hbo', color: '#C87FFF', bg: 'rgba(160,32,240,0.15)', border: 'rgba(160,32,240,0.4)' },
      // Hulu
      15: { name: 'Hulu', short: 'HU', cls: 'hulu', color: '#1CE783', bg: 'rgba(28,231,131,0.15)', border: 'rgba(28,231,131,0.4)' },
      // Apple
      2: { name: 'Apple TV Store', short: 'ATV', cls: 'apple', color: '#fff', bg: 'rgba(255,255,255,0.08)', border: 'rgba(255,255,255,0.2)' },
      350: { name: 'Apple TV+', short: 'ATV', cls: 'apple', color: '#fff', bg: 'rgba(255,255,255,0.08)', border: 'rgba(255,255,255,0.2)' },
      2243: { name: 'Apple TV Amazon', short: 'ATV', cls: 'apple', color: '#fff', bg: 'rgba(255,255,255,0.08)', border: 'rgba(255,255,255,0.2)' },
      // Paramount
      187: { name: 'Paramount Pics', short: 'PAR', cls: 'paramount', color: '#0086CE', bg: 'rgba(0,134,206,0.15)', border: 'rgba(0,134,206,0.4)' },
      531: { name: 'Paramount+', short: 'P+', cls: 'paramount', color: '#0086CE', bg: 'rgba(0,134,206,0.15)', border: 'rgba(0,134,206,0.4)' },
      582: { name: 'Paramount+ Amazon', short: 'P+', cls: 'paramount', color: '#0086CE', bg: 'rgba(0,134,206,0.15)', border: 'rgba(0,134,206,0.4)' },
      633: { name: 'Paramount+ Roku', short: 'P+', cls: 'paramount', color: '#0086CE', bg: 'rgba(0,134,206,0.15)', border: 'rgba(0,134,206,0.4)' },
      1853: { name: 'Paramount+ Apple', short: 'P+', cls: 'paramount', color: '#0086CE', bg: 'rgba(0,134,206,0.15)', border: 'rgba(0,134,206,0.4)' },
      2303: { name: 'Paramount+ Premium', short: 'P+', cls: 'paramount', color: '#0086CE', bg: 'rgba(0,134,206,0.15)', border: 'rgba(0,134,206,0.4)' },
      2580: { name: 'Paramount+ Ads', short: 'P+', cls: 'paramount', color: '#0086CE', bg: 'rgba(0,134,206,0.15)', border: 'rgba(0,134,206,0.4)' },
      2616: { name: 'Paramount+ Essntl', short: 'P+', cls: 'paramount', color: '#0086CE', bg: 'rgba(0,134,206,0.15)', border: 'rgba(0,134,206,0.4)' },
      // Peacock
      386: { name: 'Peacock', short: 'PCK', cls: 'peacock', color: '#E86803', bg: 'rgba(232,104,3,0.15)', border: 'rgba(232,104,3,0.4)' },
      387: { name: 'Peacock Free', short: 'PCK', cls: 'peacock', color: '#E86803', bg: 'rgba(232,104,3,0.15)', border: 'rgba(232,104,3,0.4)' },
      // Crunchyroll
      283: { name: 'Crunchyroll', short: 'CR', cls: 'default', color: '#F47521', bg: 'rgba(244,117,33,0.15)', border: 'rgba(244,117,33,0.4)' },
      // FuboTV
      257: { name: 'Fubo TV', short: 'FUB', cls: 'default', color: '#8B5CF6', bg: 'rgba(139,92,246,0.15)', border: 'rgba(139,92,246,0.4)' },
      // Showtime
      37: { name: 'Showtime', short: 'SHO', cls: 'default', color: '#C41230', bg: 'rgba(196,18,48,0.15)', border: 'rgba(196,18,48,0.4)' },
      // Discovery+
      524: { name: 'Discovery+', short: 'DIS', cls: 'default', color: '#0B6FC2', bg: 'rgba(11,111,194,0.15)', border: 'rgba(11,111,194,0.4)' },
      510: { name: 'Discovery+ Alt', short: 'DIS', cls: 'default', color: '#0B6FC2', bg: 'rgba(11,111,194,0.15)', border: 'rgba(11,111,194,0.4)' },
      520: { name: 'Discovery+ Alt2', short: 'DIS', cls: 'default', color: '#0B6FC2', bg: 'rgba(11,111,194,0.15)', border: 'rgba(11,111,194,0.4)' },
      584: { name: 'Discovery+ Amazon', short: 'DIS', cls: 'default', color: '#0B6FC2', bg: 'rgba(11,111,194,0.15)', border: 'rgba(11,111,194,0.4)' },
      // AMC
      526: { name: 'AMC+', short: 'AMC', cls: 'default', color: '#EF3F2F', bg: 'rgba(239,63,47,0.15)', border: 'rgba(239,63,47,0.4)' },
      528: { name: 'AMC+ Amazon', short: 'AMC', cls: 'default', color: '#EF3F2F', bg: 'rgba(239,63,47,0.15)', border: 'rgba(239,63,47,0.4)' },
      1854: { name: 'AMC+ Apple TV', short: 'AMC', cls: 'default', color: '#EF3F2F', bg: 'rgba(239,63,47,0.15)', border: 'rgba(239,63,47,0.4)' },
      635: { name: 'AMC+ Roku', short: 'AMC', cls: 'default', color: '#EF3F2F', bg: 'rgba(239,63,47,0.15)', border: 'rgba(239,63,47,0.4)' },
      2561: { name: 'AMC+ Channels', short: 'AMC', cls: 'default', color: '#EF3F2F', bg: 'rgba(239,63,47,0.15)', border: 'rgba(239,63,47,0.4)' },
      // Starz
      43: { name: 'Starz', short: 'STZ', cls: 'default', color: '#0067B0', bg: 'rgba(0,103,176,0.15)', border: 'rgba(0,103,176,0.4)' },
      630: { name: 'StarzPlay', short: 'STZ', cls: 'default', color: '#0067B0', bg: 'rgba(0,103,176,0.15)', border: 'rgba(0,103,176,0.4)' },
      634: { name: 'Starz Roku', short: 'STZ', cls: 'default', color: '#0067B0', bg: 'rgba(0,103,176,0.15)', border: 'rgba(0,103,176,0.4)' },
      1794: { name: 'Starz Amazon', short: 'STZ', cls: 'default', color: '#0067B0', bg: 'rgba(0,103,176,0.15)', border: 'rgba(0,103,176,0.4)' },
      1855: { name: 'Starz Apple TV', short: 'STZ', cls: 'default', color: '#0067B0', bg: 'rgba(0,103,176,0.15)', border: 'rgba(0,103,176,0.4)' },
      // Mubi
      11: { name: 'MUBI', short: 'MU', cls: 'default', color: '#48C4C4', bg: 'rgba(72,196,196,0.15)', border: 'rgba(72,196,196,0.4)' },
      // Tubi
      73: { name: 'Tubi TV', short: 'TUB', cls: 'default', color: '#FF5500', bg: 'rgba(255,85,0,0.15)', border: 'rgba(255,85,0,0.4)' },
      // YouTube / Google
      3: { name: 'Google Play', short: 'GP', cls: 'default', color: '#FF0000', bg: 'rgba(255,0,0,0.12)', border: 'rgba(255,0,0,0.35)' },
      192: { name: 'YouTube', short: 'YT', cls: 'default', color: '#FF0000', bg: 'rgba(255,0,0,0.12)', border: 'rgba(255,0,0,0.35)' },
      188: { name: 'YouTube Premium', short: 'YT', cls: 'default', color: '#FF0000', bg: 'rgba(255,0,0,0.12)', border: 'rgba(255,0,0,0.35)' },
      235: { name: 'YouTube Free', short: 'YT', cls: 'default', color: '#FF0000', bg: 'rgba(255,0,0,0.12)', border: 'rgba(255,0,0,0.35)' },
      2528: { name: 'YouTube TV', short: 'YTTV', cls: 'default', color: '#FF0000', bg: 'rgba(255,0,0,0.12)', border: 'rgba(255,0,0,0.35)' },
      // Plex
      538: { name: 'Plex', short: 'PLX', cls: 'default', color: '#E5A00D', bg: 'rgba(229,160,13,0.15)', border: 'rgba(229,160,13,0.4)' },
      // Vudu / Fandango
      7: { name: 'Vudu', short: 'VDU', cls: 'default', color: '#4DA3E0', bg: 'rgba(77,163,224,0.15)', border: 'rgba(77,163,224,0.4)' },
      332: { name: 'Fandango Free', short: 'FDG', cls: 'default', color: '#4DA3E0', bg: 'rgba(77,163,224,0.15)', border: 'rgba(77,163,224,0.4)' },
      // MGM
      1757: { name: 'MGM+', short: 'MGM', cls: 'default', color: '#0F7A3A', bg: 'rgba(15,122,58,0.15)', border: 'rgba(15,122,58,0.4)' },
      583: { name: 'MGM+ Amazon', short: 'MGM', cls: 'default', color: '#0F7A3A', bg: 'rgba(15,122,58,0.15)', border: 'rgba(15,122,58,0.4)' },
      636: { name: 'MGM+ Roku', short: 'MGM', cls: 'default', color: '#0F7A3A', bg: 'rgba(15,122,58,0.15)', border: 'rgba(15,122,58,0.4)' },
      2141: { name: 'MGM+ Amazon Alt', short: 'MGM', cls: 'default', color: '#0F7A3A', bg: 'rgba(15,122,58,0.15)', border: 'rgba(15,122,58,0.4)' },
      2142: { name: 'MGM+ Apple TV', short: 'MGM', cls: 'default', color: '#0F7A3A', bg: 'rgba(15,122,58,0.15)', border: 'rgba(15,122,58,0.4)' },
      // BritBox
      151: { name: 'BritBox', short: 'BB', cls: 'default', color: '#1380A1', bg: 'rgba(19,128,161,0.15)', border: 'rgba(19,128,161,0.4)' },
      // Curiosity
      390: { name: 'Curiosity Stream', short: 'CS', cls: 'default', color: '#F5A623', bg: 'rgba(245,166,35,0.15)', border: 'rgba(245,166,35,0.4)' },
      2060: { name: 'Curiosity Apple', short: 'CS', cls: 'default', color: '#F5A623', bg: 'rgba(245,166,35,0.15)', border: 'rgba(245,166,35,0.4)' },
      // Pluto
      300: { name: 'Pluto TV', short: 'PLT', cls: 'default', color: '#FFEA00', bg: 'rgba(255,234,0,0.12)', border: 'rgba(255,234,0,0.35)' },
      1965: { name: 'Pluto TV Live', short: 'PLT', cls: 'default', color: '#FFEA00', bg: 'rgba(255,234,0,0.12)', border: 'rgba(255,234,0,0.35)' },
      // Shudder
      99: { name: 'Shudder', short: 'SHD', cls: 'default', color: '#AF0025', bg: 'rgba(175,0,37,0.15)', border: 'rgba(175,0,37,0.4)' },
      // Acorn TV
      87: { name: 'Acorn TV', short: 'ACN', cls: 'default', color: '#5C4033', bg: 'rgba(92,64,51,0.15)', border: 'rgba(92,64,51,0.4)' },
      2034: { name: 'Acorn TV Apple', short: 'ACN', cls: 'default', color: '#5C4033', bg: 'rgba(92,64,51,0.15)', border: 'rgba(92,64,51,0.4)' },
      2048: { name: 'Sundance Now Apple', short: 'SUN', cls: 'default', color: '#5C4033', bg: 'rgba(92,64,51,0.15)', border: 'rgba(92,64,51,0.4)' },
      // Sky
      29: { name: 'Sky Go', short: 'SKY', cls: 'default', color: '#0000FF', bg: 'rgba(0,0,255,0.15)', border: 'rgba(0,0,255,0.4)' },
      210: { name: 'Sky Standard', short: 'SKY', cls: 'default', color: '#0000FF', bg: 'rgba(0,0,255,0.15)', border: 'rgba(0,0,255,0.4)' },
      30: { name: 'WOW', short: 'WOW', cls: 'default', color: '#0000FF', bg: 'rgba(0,0,255,0.15)', border: 'rgba(0,0,255,0.4)' },
      39: { name: 'Now TV', short: 'NOW', cls: 'default', color: '#0000FF', bg: 'rgba(0,0,255,0.15)', border: 'rgba(0,0,255,0.4)' },
      130: { name: 'Sky Store', short: 'SKY', cls: 'default', color: '#0000FF', bg: 'rgba(0,0,255,0.15)', border: 'rgba(0,0,255,0.4)' },
      321: { name: 'Sky X', short: 'SKY', cls: 'default', color: '#0000FF', bg: 'rgba(0,0,255,0.15)', border: 'rgba(0,0,255,0.4)' },
      591: { name: 'Now TV Cinema', short: 'NOW', cls: 'default', color: '#0000FF', bg: 'rgba(0,0,255,0.15)', border: 'rgba(0,0,255,0.4)' },
      1773: { name: 'SkyShowtime', short: 'SKY', cls: 'default', color: '#0000FF', bg: 'rgba(0,0,255,0.15)', border: 'rgba(0,0,255,0.4)' },
      2624: { name: 'TV2 SkyShowtime', short: 'SKY', cls: 'default', color: '#0000FF', bg: 'rgba(0,0,255,0.15)', border: 'rgba(0,0,255,0.4)' },
      // Other
      258: { name: 'Criterion', short: 'CRI', cls: 'default', color: '#888', bg: 'rgba(136,136,136,0.15)', border: 'rgba(136,136,136,0.4)' },
      207: { name: 'The Roku Channel', short: 'ROK', cls: 'default', color: '#5C4033', bg: 'rgba(92,64,51,0.15)', border: 'rgba(92,64,51,0.4)' },
      38: { name: 'BBC iPlayer', short: 'BBC', cls: 'default', color: '#FF0055', bg: 'rgba(255,0,85,0.15)', border: 'rgba(255,0,85,0.4)' },
      2311: { name: 'Channel 4 Plus', short: 'C4', cls: 'default', color: '#00FF00', bg: 'rgba(0,255,0,0.15)', border: 'rgba(0,255,0,0.4)' },
      2101: { name: 'Canal+', short: 'C+', cls: 'default', color: '#000', bg: 'rgba(40,40,40,0.5)', border: 'rgba(100,100,100,0.4)' },
      345: { name: 'Canal+ Séries', short: 'C+', cls: 'default', color: '#000', bg: 'rgba(40,40,40,0.5)', border: 'rgba(100,100,100,0.4)' },
      381: { name: 'Canal+ Alt', short: 'C+', cls: 'default', color: '#000', bg: 'rgba(40,40,40,0.5)', border: 'rgba(100,100,100,0.4)' },
      1929: { name: 'Filmtastic', short: 'FIL', cls: 'default', color: '#000', bg: 'rgba(40,40,40,0.5)', border: 'rgba(100,100,100,0.4)' },
      2102: { name: 'Premiery Canal+', short: 'C+', cls: 'default', color: '#000', bg: 'rgba(40,40,40,0.5)', border: 'rgba(100,100,100,0.4)' },
      298: { name: 'RTL+', short: 'RTL', cls: 'default', color: '#FF0000', bg: 'rgba(255,0,0,0.15)', border: 'rgba(255,0,0,0.4)' },
      2578: { name: 'RTL+ Max Amazon', short: 'RTL', cls: 'default', color: '#FF0000', bg: 'rgba(255,0,0,0.15)', border: 'rgba(255,0,0,0.4)' },
      344: { name: 'Rakuten Viki', short: 'RAK', cls: 'default', color: '#BF0000', bg: 'rgba(191,0,0,0.15)', border: 'rgba(191,0,0,0.4)' },
      55: { name: 'Showmax', short: 'SHW', cls: 'default', color: '#00BFFF', bg: 'rgba(0,191,255,0.15)', border: 'rgba(0,191,255,0.4)' },
      84: { name: 'U-NEXT', short: 'UNX', cls: 'default', color: '#0000FF', bg: 'rgba(0,0,255,0.15)', border: 'rgba(0,0,255,0.4)' },
      237: { name: 'SonyLIV', short: 'SLV', cls: 'default', color: '#111', bg: 'rgba(30,30,30,0.4)', border: 'rgba(80,80,80,0.5)' },
      307: { name: 'Globoplay', short: 'GLO', cls: 'default', color: '#00FF00', bg: 'rgba(0,255,0,0.15)', border: 'rgba(0,255,0,0.4)' },
      457: { name: 'ViX', short: 'VIX', cls: 'default', color: '#FF0000', bg: 'rgba(255,0,0,0.15)', border: 'rgba(255,0,0,0.4)' },
      581: { name: 'iQIYI', short: 'IQI', cls: 'default', color: '#00FF00', bg: 'rgba(0,255,0,0.15)', border: 'rgba(0,255,0,0.4)' },
      // Spectrum
      486: { name: 'Spectrum TV', short: 'SPC', cls: 'default', color: '#0070CC', bg: 'rgba(0,112,204,0.15)', border: 'rgba(0,112,204,0.4)' },
      // Philo
      2383: { name: 'Philo', short: 'PHI', cls: 'default', color: '#54B848', bg: 'rgba(84,184,72,0.15)', border: 'rgba(84,184,72,0.4)' },
      // MGM+ (id 34)
      34: { name: 'MGM+', short: 'MGM', cls: 'default', color: '#0F7A3A', bg: 'rgba(15,122,58,0.15)', border: 'rgba(15,122,58,0.4)' },
    };

    const watchCache = {}, providerLogos = {};
    let heroMovies = [], heroIdx = 0, heroTimer = null;
    let currentMovies = [], currentTV = [], activeMovieFilter = 'all', activeTVFilter = 'all';

    // Season / Episode chooser state
    let _currentModalId = null, _currentModalType = 'movie', _currentModalItem = null;
    let _selectedSeason = 1, _selectedEpisode = 1;
    let _seasonEpCache = {}; // { tvId: { season: episodes[] } }

    // TMDB genre ID map for trending cards
    const GENRE_MAP = {
      28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
      99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
      27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
      53: 'Thriller', 10752: 'War', 37: 'Western', 10759: 'Action & Adv.',
      10762: 'Kids', 10763: 'News', 10764: 'Reality', 10765: 'Sci-Fi & Fantasy',
      10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics'
    };

    async function tmdb(path) {
      try {
        const r = await fetch(`/api/tmdb?target=${encodeURIComponent(path)}`);
        if (!r.ok) return {};
        const text = await r.text();
        return text ? JSON.parse(text) : {};
      } catch (e) {
        return {};
      }
    }
    async function getWatch(id, type = 'movie') {
      const key = `${type}-${id}`;
      if (watchCache[key]) return watchCache[key];
      try {
        const d = await tmdb(`/${type}/${id}/watch/providers`);
        const res = (d.results && d.results[COUNTRY]) || null;
        watchCache[key] = res;
        if (res) { ['flatrate', 'rent', 'buy'].forEach(c => { if (res[c]) res[c].forEach(p => { if (p.logo_path) providerLogos[p.provider_id] = p.logo_path; }); }); }
        return res;
      } catch { return null }
    }


    async function getImdbId(id, type = 'movie') {
      try { const d = await tmdb(`/${type}/${id}/external_ids`); return d.imdb_id || null; } catch { return null }
    }

    async function getCredits(id, type = 'movie') {
      try { const d = await tmdb(`/${type}/${id}/credits`); return d; } catch { return null }
    }

    function imgUrl(p, s = 'w500') { return p ? `${IMG}${s}${p}` : '' }

    // SVG circular progress ring (r=16 → circumference ≈ 100.53)
    function buildRatingRing(vote, idSuffix, mini = false) {
      const r = 16;
      const circ = +(2 * Math.PI * r).toFixed(2); // ~100.53
      const v = parseFloat(vote);
      const frac = (!isNaN(v) && v > 0) ? Math.min(v / 10, 1) : 0;
      const offset = +(circ * (1 - frac)).toFixed(2);
      const tierCls = isNaN(v) || v === 0 ? 'ring-na'
        : v >= 7.5 ? 'ring-high'
          : v >= 6 ? 'ring-mid'
            : 'ring-low';
      const miniCls = mini ? ' mini' : '';
      const scoreText = (!isNaN(v) && v > 0) ? v.toFixed(1) : '—';
      return `<div class="rating-ring-wrap${miniCls} ${tierCls}" id="ring-${idSuffix}">
        <svg viewBox="0 0 36 36" width="100%" height="100%">
          <circle class="rating-ring-bg" cx="18" cy="18" r="${r}"/>
          <circle class="rating-ring-fg" cx="18" cy="18" r="${r}"
            stroke-dasharray="${circ}"
            stroke-dashoffset="${offset}"/>
        </svg>
        <div class="rating-ring-label">
          <span class="rating-ring-score">${scoreText}</span>
          <span class="rating-ring-denom">/10</span>
        </div>
      </div>`;
    }

    function getProviderInfo(id) {
      return PROVIDERS[id] || { name: `Platform ${id}`, short: 'WEB', cls: 'default', color: '#8892A4', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.15)' };
    }

    function buildStreamPills(providers, max = 3) {
      if (!providers || !providers.length) return '';
      return providers.slice(0, max).map(p => {
        const info = getProviderInfo(p.provider_id);
        const logoHtml = p.logo_path ? `<img src="${IMG}w45${p.logo_path}" style="width:14px;height:14px;border-radius:2px;object-fit:cover;display:block">` : info.short;
        return `<span class="card-stream-pill" style="background:${info.bg};border:1px solid ${info.border};color:${info.color};display:inline-flex;align-items:center;justify-content:center;padding:${p.logo_path ? '2px' : '0.18rem 0.5rem'}">${logoHtml}</span>`;
      }).join('');
    }

    function buildStreamLogoHTML(providers, max = 3) {
      if (!providers || !providers.length) return '';
      return providers.slice(0, max).map(p => {
        const info = getProviderInfo(p.provider_id);
        if (p.logo_path) {
          return `<div class="card-stream-logo csl-${info.cls}" style="width:22px;height:22px;background:${info.bg.replace('0.15', '0.9')};border:1px solid ${info.border};padding:0"><img src="${IMG}w45${p.logo_path}" style="width:100%;height:100%;object-fit:cover;border-radius:3px;display:block"></div>`;
        }
        return `<div class="card-stream-logo csl-${info.cls}" style="background:${info.bg.replace('0.15', '0.9')};color:${info.color};border:1px solid ${info.border}">${info.short}</div>`;
      }).join('');
    }

    function buildModalStreamPills(flatrate, rent) {
      let html = '';
      if (flatrate && flatrate.length) {
        flatrate.forEach(p => {
          const info = getProviderInfo(p.provider_id);
          const logo = p.logo_path ? `<img src="${IMG}w45${p.logo_path}" style="width:18px;height:18px;border-radius:4px;object-fit:cover" alt="">` : '';
          const url = PLATFORM_URLS[p.provider_id] || `https://www.google.com/search?q=watch+on+${encodeURIComponent(info.name)}`;
          html += `<a class="modal-stream-pill" style="background:${info.bg};border-color:${info.border};color:${info.color}" href="${url}" target="_blank" rel="noopener">${logo} ${info.name}</a>`;
        });
      }
      return html || '<div class="no-stream">Not available for streaming in your region</div>';
    }

    function buildRentPills(rent) {
      if (!rent || !rent.length) return '';
      return rent.slice(0, 4).map(p => {
        const info = getProviderInfo(p.provider_id);
        return `<div class="modal-rent-pill">${info.name}</div>`;
      }).join('');
    }

    function buildCard(item, rank = null, type = 'movie', watchData = null) {
      const poster = imgUrl(item.poster_path, 'w342');
      const title = item.title || item.name || 'Unknown';
      const year = (item.release_date || item.first_air_date || '').slice(0, 4);
      const vote = item.vote_average ? item.vote_average.toFixed(1) : '—';
      const typeLabel = type === 'movie' ? 'Movie' : 'TV';
      const typeClass = type === 'movie' ? 'type-movie' : 'type-tv';
      const flat = watchData && watchData.flatrate ? watchData.flatrate : [];
      const streamPills = buildStreamPills(flat, 3);
      const streamLogos = buildStreamLogoHTML(flat, 3);
      const providerIds = flat.map(p => p.provider_id);

      // New episode badge: check both last and next episode (TMDB caching/timezone flex)
      let hasNewEp = false;
      if (type === 'tv') {
        const checkEp = (ep) => {
          if (!ep || !ep.air_date) return false;
          const airTime = new Date(ep.air_date + 'T00:00:00Z').getTime();
          const diff = Date.now() - airTime;
          // Must be within the last 6 days, or up to 2 days in the future
          return diff <= (6 * 24 * 60 * 60 * 1000) && diff >= -(2 * 24 * 60 * 60 * 1000);
        };
        hasNewEp = checkEp(item.last_episode_to_air) || checkEp(item.next_episode_to_air);
      }
      const newEpBadgeHtml = hasNewEp ? `
        <div class="card-new-ep-badge">
          <div class="badge-new-episode">✦ New Episode</div>
        </div>` : '';

      return `<div class="movie-card" tabindex="0" role="button" aria-label="${title}" data-id="${item.id}" data-type="${type}" data-providers="${providerIds.join(',')}" style="opacity:1">
    <div class="card-poster">
      ${poster ? `<img src="${poster}" alt="${title}" loading="lazy" onerror="this.src=''">` :
          `<div style="width:100%;height:100%;background:var(--dark3);display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:.75rem">No Poster</div>`}
      <div class="card-overlay"></div>
      <div class="card-play"><svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg></div>
      ${rank ? `<div class="card-rank">${String(rank).padStart(2, '0')}</div>` : ''}
      ${!rank && !hasNewEp ? `<div class="type-badge ${typeClass}">${typeLabel}</div>` : ''}
      ${newEpBadgeHtml}
      ${buildRatingRing(vote, `${item.id}-card`, true)}
      <div class="card-stream-logos">${streamLogos}</div>
    </div>
    <div class="card-info">
      <div class="card-title">${title}</div>
      <div class="card-sub">${year || '—'}</div>
      <div class="card-stream-pills">${streamPills}</div>
    </div>
  </div>`;
    }

    function buildTrendingCard(item, rank, type, watchData) {
      const poster = imgUrl(item.poster_path, 'w185');
      const title = item.title || item.name || 'Unknown';
      const year = (item.release_date || item.first_air_date || '').slice(0, 4);
      const runtime = item.runtime ? `${item.runtime} min` : '';
      const vote = item.vote_average ? item.vote_average.toFixed(1) : null;
      const typeLabel = type === 'movie' ? 'Movie' : 'TV Show';
      const typeCls = type === 'movie' ? 'trending-type-movie' : 'trending-type-tv';
      const genres = (item.genre_ids || []).slice(0, 1).map(id => GENRE_MAP[id]).filter(Boolean);

      let scoreCls = 'score-na';
      if (vote) {
        const v = parseFloat(vote);
        scoreCls = v >= 7.5 ? 'score-high' : v >= 6 ? 'score-mid' : 'score-low';
      }

      const metaParts = [runtime, year].filter(Boolean).join(' · ');

      return `<div class="trending-card" tabindex="0" role="button" aria-label="${title}" data-id="${item.id}" data-type="${type}">
      <div class="trending-poster" style="position:relative">
        ${poster ? `<img src="${poster}" alt="${title}" loading="lazy">` : ''}
      </div>
      <div class="trending-info">
        ${metaParts ? `<div class="trending-meta">${metaParts}</div>` : ''}
        <div class="trending-title">${title}</div>
        <div class="trending-genres">
          ${genres.map(g => `<span class="trending-genre-tag">${g}</span>`).join('')}
          <span class="trending-type-tag ${typeCls}">${typeLabel}</span>
        </div>
      </div>
      ${buildRatingRing(vote || '0', `${item.id}-tr`, false)}
    </div>`;
    }

    // Major platforms always shown in filter bar (in display order)
    const PINNED_PROVIDERS = [8, 1796, 119, 337, 1899, 15, 350, 386, 531];

    // All variant IDs for each pinned provider (so filter works regardless of sub-variant)
    const PROVIDER_GROUPS = {
      8: [8],                                           // Netflix
      1796: [1796],                                        // Netflix with Ads
      119: [9, 10, 119, 613, 2100, 1898],                // Prime Video (all variants)
      337: [337, 122, 508],                               // Disney+
      1899: [1899, 1825, 2472, 2284],                     // Max / HBO
      15: [15],                                         // Hulu
      350: [2, 350, 2243],                               // Apple TV+
      386: [386, 387],                                   // Peacock
      531: [531, 582, 633, 187, 1853, 2303, 2580, 2616], // Paramount+
    };

    // Returns Set of all IDs for a given pinned group representative
    function getGroupIds(pinnedId) {
      return new Set((PROVIDER_GROUPS[pinnedId] || [pinnedId]).map(Number));
    }

    function buildFilterBtn(id, info, activeFilter) {
      const logoPath = providerLogos[id] || providerLogos[+id];
      const logoHtml = logoPath
        ? `<img src="${IMG}w45${logoPath}" style="width:16px;height:16px;border-radius:3px;object-fit:cover;flex-shrink:0" alt="">`
        : `<span style="font-size:.72rem;font-weight:900">${info.short}</span>`;
      const isActive = activeFilter === String(id);
      return `<button class="stream-filter-btn sfb-${info.cls} ${isActive ? 'active' : ''}" data-id="${id}"
        style="${isActive ? `background:${info.color};color:#07090F;border-color:transparent` : ''};display:inline-flex;align-items:center;gap:.35rem">
        ${logoHtml}<span>${info.name}</span>
      </button>`;
    }

    function buildFilterBar(containerId, items, activeFilter, onFilter) {
      const bar = document.getElementById(containerId);

      // Collect all provider IDs present in displayed cards
      const cardProviderIds = new Set();
      items.forEach(item => {
        (item.dataset?.providers || '').split(',').filter(Boolean).forEach(id => cardProviderIds.add(+id));
      });

      // Show a pinned provider button if ANY of its variant IDs appears in cards
      const shownGroupIds = new Set();
      let html = `<button class="stream-filter-btn sfb-all ${activeFilter === 'all' ? 'active' : ''}" data-id="all">🎬 All</button>`;

      PINNED_PROVIDERS.forEach(id => {
        const groupIds = getGroupIds(id);
        const hasAny = [...groupIds].some(gid => cardProviderIds.has(gid));
        if (!hasAny) return;
        const info = getProviderInfo(id);
        // Use the first matching logo from any group variant
        const logoId = [...groupIds].find(gid => providerLogos[gid]) || id;
        const logoPath = providerLogos[logoId];
        const logoHtml = logoPath
          ? `<img src="${IMG}w45${logoPath}" style="width:16px;height:16px;border-radius:3px;object-fit:cover;flex-shrink:0" alt="">`
          : `<span style="font-size:.72rem;font-weight:900">${info.short}</span>`;
        const isActive = activeFilter === String(id);
        html += `<button class="stream-filter-btn sfb-${info.cls} ${isActive ? 'active' : ''}" data-id="${id}"
          style="${isActive ? `background:${info.color};color:#07090F;border-color:transparent` : ''};display:inline-flex;align-items:center;gap:.35rem">
          ${logoHtml}<span>${info.name}</span>
        </button>`;
        // Mark all variant IDs as handled so they don't appear as extras
        groupIds.forEach(gid => shownGroupIds.add(gid));
      });

      // Append any extra providers from cards not covered by a group (up to 4)
      let extras = 0;
      cardProviderIds.forEach(id => {
        if (shownGroupIds.has(id) || extras >= 4) return;
        const info = getProviderInfo(id);
        const logoPath = providerLogos[id];
        const logoHtml = logoPath
          ? `<img src="${IMG}w45${logoPath}" style="width:16px;height:16px;border-radius:3px;object-fit:cover;flex-shrink:0" alt="">`
          : `<span style="font-size:.72rem;font-weight:900">${info.short}</span>`;
        const isActive = activeFilter === String(id);
        html += `<button class="stream-filter-btn sfb-${info.cls} ${isActive ? 'active' : ''}" data-id="${id}"
          style="${isActive ? `background:${info.color};color:#07090F;border-color:transparent` : ''};display:inline-flex;align-items:center;gap:.35rem">
          ${logoHtml}<span>${info.name}</span>
        </button>`;
        shownGroupIds.add(id);
        extras++;
      });

      bar.innerHTML = html;

      bar.querySelectorAll('.stream-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          bar.querySelectorAll('.stream-filter-btn').forEach(b => {
            b.classList.remove('active');
            b.style.background = ''; b.style.color = ''; b.style.borderColor = '';
          });
          btn.classList.add('active');
          const id = btn.dataset.id;
          if (id !== 'all') {
            const info = getProviderInfo(+id);
            btn.style.background = info.color;
            btn.style.color = '#07090F';
            btn.style.borderColor = 'transparent';
          }
          gsap.fromTo(btn, { scale: .92 }, { scale: 1, duration: .25, ease: 'back.out(2)' });
          onFilter(id);
        });
      });
    }

    function filterCards(gridId, filterId) {
      const cards = document.querySelectorAll(`#${gridId} .movie-card`);
      // Get all variant IDs for the selected group (or just the one ID if not pinned)
      const groupIds = filterId === 'all' ? null : getGroupIds(+filterId);
      cards.forEach(card => {
        const cardIds = new Set((card.dataset.providers || '').split(',').filter(Boolean).map(Number));
        const show = filterId === 'all' || (groupIds && [...groupIds].some(gid => cardIds.has(gid)));
        gsap.to(card, { opacity: show ? 1 : .15, scale: show ? 1 : .95, duration: .3, ease: 'power2.out' });
      });
    }

    function buildPlatformGrid(allItems) {
      const counts = {};
      allItems.forEach(item => {
        const ids = (item.dataset && item.dataset.providers ? item.dataset.providers : '').split(',').filter(Boolean);
        ids.forEach(id => { counts[id] = (counts[id] || 0) + 1; });
      });
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
      const grid = document.getElementById('platformGrid');
      grid.innerHTML = sorted.map(([id, count]) => {
        const info = getProviderInfo(+id);
        const logoPath = providerLogos[id] || providerLogos[+id];
        const logoHtml = logoPath ? `<img src="${IMG}w154${logoPath}" style="width:100%;height:100%;object-fit:cover;border-radius:11px" alt="${info.name}">` : `<span style="font-size:.85rem;font-weight:900;letter-spacing:-.5px">${info.short}</span>`;
        const url = PLATFORM_URLS[+id] || `https://www.google.com/search?q=watch+on+${encodeURIComponent(info.name)}`;
        return `<div class="platform-card" data-pid="${id}" style="border-color:${info.border};cursor:pointer" onclick="window.open('${url}','_blank')">
      <div class="platform-icon" style="background:${info.bg};color:${info.color};border:1px solid ${info.border};font-size:.95rem;font-weight:900;overflow:hidden;display:flex;align-items:center;justify-content:center">${logoHtml}</div>
      <div class="platform-name">${info.name}</div>
      <div class="platform-count">${count} title${count !== 1 ? 's' : ''} available</div>
    </div>`;
      }).join('');
      gsap.fromTo(grid.children,
        { opacity: 0, y: 40, rotationX: 20, scale: .9, transformPerspective: 1000, transformOrigin: 'top center' },
        { opacity: 1, y: 0, rotationX: 0, scale: 1, duration: .6, stagger: .07, ease: 'back.out(1.2)', scrollTrigger: { trigger: grid, start: 'top 85%' } }
      );
    }

    // HERO
    async function loadHero(movies) {
      heroMovies = movies.slice(0, 6);
      const dotsEl = document.getElementById('heroDots');
      dotsEl.innerHTML = heroMovies.map((_, i) => `<div class="hero-dot ${i === 0 ? 'active' : ''}" data-i="${i}"></div>`).join('');
      dotsEl.querySelectorAll('.hero-dot').forEach(d => d.addEventListener('click', () => { clearInterval(heroTimer); setHero(+d.dataset.i); heroTimer = setInterval(() => setHero((heroIdx + 1) % heroMovies.length), 15000); }));
      setHero(0, true);
      heroTimer = setInterval(() => setHero((heroIdx + 1) % heroMovies.length), 15000);

      // ── Touch swipe & scroll-wheel navigation on hero ──────────────────────
      const heroEl = document.getElementById('hero');
      let _touchStartX = 0, _touchStartY = 0, _touchStartT = 0;
      let _wheelLock = false;

      function heroNav(dir) {
        // dir: +1 = next, -1 = prev
        clearInterval(heroTimer);
        const next = ((heroIdx + dir) + heroMovies.length) % heroMovies.length;
        // Animate content slide direction
        const slideX = dir > 0 ? -40 : 40;
        gsap.fromTo('#heroContent', { x: 0, opacity: 1 }, {
          x: slideX, opacity: 0, duration: 0.22, ease: 'power2.in',
          onComplete: () => {
            setHero(next);
            gsap.fromTo('#heroContent', { x: -slideX, opacity: 0 }, { x: 0, opacity: 1, duration: 0.35, ease: 'power3.out' });
          }
        });
        heroTimer = setInterval(() => setHero((heroIdx + 1) % heroMovies.length), 15000);
      }

      // Touch: swipe left → next, swipe right → prev
      heroEl.addEventListener('touchstart', e => {
        _touchStartX = e.touches[0].clientX;
        _touchStartY = e.touches[0].clientY;
        _touchStartT = Date.now();
      }, { passive: true });

      heroEl.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - _touchStartX;
        const dy = e.changedTouches[0].clientY - _touchStartY;
        const dt = Date.now() - _touchStartT;
        // Must be faster than 400ms, more horizontal than vertical, > 45px
        if (dt < 400 && Math.abs(dx) > Math.abs(dy) * 1.3 && Math.abs(dx) > 45) {
          heroNav(dx < 0 ? 1 : -1);
        }
      }, { passive: true });

      // Mouse drag for PC: drag left/right to navigate
      let _isDragging = false;
      heroEl.addEventListener('mousedown', e => {
        _isDragging = true;
        _touchStartX = e.clientX;
        _touchStartY = e.clientY;
        _touchStartT = Date.now();
        heroEl.style.cursor = 'grabbing';
      });

      window.addEventListener('mouseup', e => {
        if (!_isDragging) return;
        _isDragging = false;
        heroEl.style.cursor = '';
        const dx = e.clientX - _touchStartX;
        const dy = e.clientY - _touchStartY;
        const dt = Date.now() - _touchStartT;
        if (dt < 400 && Math.abs(dx) > Math.abs(dy) * 1.3 && Math.abs(dx) > 45) {
          heroNav(dx < 0 ? 1 : -1);
        }
      });
    }

    async function setHero(idx, initial = false) {
      if (!initial) {
        const mOpen = document.getElementById('modal')?.classList.contains('open');
        const pOpen = document.getElementById('playerOverlay')?.classList.contains('open');
        const sOpen = document.getElementById('searchOverlay')?.classList.contains('open');
        if (mOpen || pOpen || sOpen) return;
      }

      heroIdx = idx;
      document.querySelectorAll('.hero-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
      const m = heroMovies[idx];
      const type = m.title ? 'movie' : 'tv';

      const heroImg = document.getElementById('heroImg');
      const heroVideo = document.getElementById('heroVideoContainer');

      heroImg.classList.remove('loaded');
      heroVideo.style.opacity = '0';
      if (ytPlayer && typeof ytPlayer.destroy === 'function') {
        ytPlayer.destroy();
        ytPlayer = null;
      }
      heroVideo.innerHTML = '';

      if (m.backdrop_path) {
        // Use w1280 instead of original — saves ~60–80 % bandwidth with no visible quality loss
      heroImg.src = `${IMG}w1280${m.backdrop_path}`;
        heroImg.onload = () => {
          heroImg.classList.add('loaded');
          // Pass the already-loaded element — avoids a second network request
          applyDynamicColors(heroImg);
        };
      }

      // Try to load video background — clear any stale pending key first
      _pendingTrailerKey = null;
      tmdb(`/${type}/${m.id}/videos`).then(vidData => {
        const trailer = (vidData.results || []).find(v => v.type === 'Trailer' && v.site === 'YouTube');
        if (!trailer) return;
        if (isYtApiReady) {
          _createHeroPlayer(trailer.key);
        } else {
          // API not ready yet — store key so onYouTubeIframeAPIReady picks it up
          _pendingTrailerKey = trailer.key;
        }
      }).catch(() => { });

      const title = (m.title || m.name || '').toUpperCase();
      const words = title.split(' ');
      const mid = Math.ceil(words.length / 2);
      document.getElementById('heroLine1').textContent = words.slice(0, mid).join(' ');
      document.getElementById('heroLine2').textContent = words.slice(mid).join(' ');
      document.getElementById('heroYear').textContent = (m.release_date || m.first_air_date || '').slice(0, 4);
      document.getElementById('heroPlot').textContent = m.overview || '';
      document.getElementById('heroImdb').textContent = `⭐ ${m.vote_average ? m.vote_average.toFixed(1) : '—'}`;

      // Streaming
      const streamWrap = document.getElementById('heroStreaming');
      streamWrap.innerHTML = '<span class="hero-streaming-label">Watch on</span>';
      const wd = await getWatch(m.id, type);
      if (wd && wd.flatrate && wd.flatrate.length) {
        wd.flatrate.slice(0, 4).forEach(p => {
          const info = getProviderInfo(p.provider_id);
          const pill = document.createElement('span');
          pill.className = `stream-pill stream-${info.cls}`;
          pill.innerHTML = `<span class="stream-dot"></span>${info.name}`;
          streamWrap.appendChild(pill);
        });
        gsap.fromTo(streamWrap.querySelectorAll('.stream-pill'), { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: .4, stagger: .07, ease: 'power3.out' });
      } else {
        const na = document.createElement('span');
        na.style.cssText = 'font-size:.78rem;color:var(--muted)';
        na.textContent = 'Not on major platforms';
        streamWrap.appendChild(na);
      }

      document.getElementById('heroMore').onclick = () => openModal(m.id, type);
      document.getElementById('heroWatch').onclick = async () => {
        const prevText = document.getElementById('heroWatch').innerHTML;
        document.getElementById('heroWatch').textContent = 'Loading...';
        try {
          const d = await tmdb(`/${type}/${m.id}/videos`);
          const t = (d.results || []).find(v => v.type === 'Trailer' && v.site === 'YouTube');
          if (t) window.open(`https://www.youtube.com/watch?v=${t.key}`, '_blank');
          else alert('Trailer not available for this title.');
        } catch {
          alert('Failed to load trailer');
        } finally {
          document.getElementById('heroWatch').innerHTML = prevText;
        }
      };

      // GSAP hero animations
      const tl = gsap.timeline();
      tl.fromTo('.hero-badge', { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: .4, ease: 'power3.out' })
        .fromTo([document.getElementById('heroLine1'), document.getElementById('heroLine2')], { y: '110%' }, { y: '0%', duration: .65, ease: 'power4.out', stagger: .1 }, '-=.1')
        .fromTo('.hero-meta', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: .4, ease: 'power3.out' }, '-=.2')
        .fromTo('#heroPlot', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: .4, ease: 'power3.out' }, '-=.15')
        .fromTo('#heroStreaming', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: .4, ease: 'power3.out' }, '-=.15')
        .fromTo('.hero-btns', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: .4, ease: 'power3.out' }, '-=.1');

      const heroPlayBtn = document.getElementById('heroPlay');
      if (heroPlayBtn) heroPlayBtn.style.display = 'none';
      try {
        if (heroPlayBtn) {
          heroPlayBtn.style.display = 'inline-flex';
          const s1Url = type === 'tv' ? `https://player.videasy.net/tv/${m.id}/1/1` : `https://player.videasy.net/movie/${m.id}`;
          const s2Url = type === 'tv' ? `https://vidsrc.me/embed/tv?tmdb=${m.id}&season=1&episode=1` : `https://vidsrc.me/embed/movie?tmdb=${m.id}`;
          const s3Url = type === 'tv' ? `https://vidfast.pro/tv/${m.id}/1/1` : `https://vidfast.pro/movie/${m.id}`;
          const s4Url = type === 'tv' ? `https://vidsrc.xyz/embed/tv?tmdb=${m.id}&season=1&episode=1` : `https://vidsrc.xyz/embed/movie?tmdb=${m.id}`;
          const s5Url = type === 'tv' ? `https://vidcore.net/tv/${m.id}/1/1?autoplay=1&server=orbit` : `https://vidcore.net/movie/${m.id}?autoplay=1&server=orbit`;
          const allUrls = [s1Url, s2Url, s3Url, s4Url, s5Url];
          const allLabels = ['Server 1', 'Server 2', 'Server 3', 'Server 4', 'Server 5'];
          heroPlayBtn.onclick = () => {
            _currentModalItem = m;
            _currentModalType = type;
            playStream(s1Url, allUrls, allLabels);
          };
        }
      } catch { }
    }

    // TRENDING
    async function loadTrending() {
      const row = document.getElementById('trendingRow');
      row.innerHTML = Array.from({ length: 15 }, () => `<div class="trending-card" style="flex:0 0 160px"><div style="aspect-ratio:2/3;background:var(--dark3)" class="sk"></div><div style="padding:.75rem"><div style="height:12px;margin-bottom:6px" class="sk"></div></div></div>`).join('');
      const [md, tvd] = await Promise.all([tmdb('/trending/movie/week?language=en-US'), tmdb('/trending/tv/week?language=en-US')]);
      const allRaw = [...(md.results || []).slice(0, 10).map(x => ({ ...x, _type: 'movie' })), ...(tvd.results || []).slice(0, 10).map(x => ({ ...x, _type: 'tv' }))].slice(0, 20);

      // Fetch TV show details in parallel (only TV items) to get last_episode_to_air
      const tvItems = allRaw.filter(x => x._type === 'tv');
      const tvDetails = await Promise.all(tvItems.map(s => tmdb(`/tv/${s.id}?language=en-US`).catch(() => null)));
      const tvDetailMap = {};
      tvItems.forEach((s, i) => { if (tvDetails[i]) tvDetailMap[s.id] = tvDetails[i]; });
      const all = allRaw.map(x => x._type === 'tv' && tvDetailMap[x.id]
        ? { 
            ...x, 
            last_episode_to_air: tvDetailMap[x.id].last_episode_to_air,
            next_episode_to_air: tvDetailMap[x.id].next_episode_to_air
          }
        : x
      );

      const watchDatas = await Promise.all(all.map(item => getWatch(item.id, item._type)));
      row.innerHTML = all.map((item, i) => buildTrendingCard(item, i + 1, item._type, watchDatas[i])).join('');
      gsap.fromTo(row.children,
        { opacity: 0, x: 50, rotationY: -15, scale: .9, transformPerspective: 1000 },
        { opacity: 1, x: 0, rotationY: 0, scale: 1, duration: .6, stagger: .07, ease: 'back.out(1.2)', scrollTrigger: { trigger: row, start: 'top 85%' } }
      );
      addCardListeners(row, '.trending-card');
      return all;
    }

    async function loadMovies(type = 'now_playing') {
      const grid = document.getElementById('moviesGrid');
      grid.innerHTML = Array.from({ length: 15 }, () => `<div class="movie-card"><div class="card-poster sk" style="aspect-ratio:2/3"></div><div class="card-info"><div class="sk" style="height:14px;margin-bottom:8px"></div><div class="sk" style="height:12px;width:60%"></div></div></div>`).join('');
      const data = await tmdb(`/movie/${type}?language=en-US&page=1`);
      const movies = (data.results || []).slice(0, 20);
      const watchDatas = await Promise.all(movies.map(m => getWatch(m.id, 'movie')));
      currentMovies = movies;
      grid.innerHTML = movies.map((m, i) => buildCard(m, null, 'movie', watchDatas[i])).join('');
      animateGrid(grid);
      addCardListeners(grid, '.movie-card');
      const cards = grid.querySelectorAll('.movie-card');
      buildFilterBar('movieFilterBar', cards, 'all', (id) => { activeMovieFilter = id; filterCards('moviesGrid', id); });

      return movies;
    }

    async function loadTV(type = 'on_the_air') {
      const grid = document.getElementById('tvGrid');
      grid.innerHTML = Array.from({ length: 15 }, () => `<div class="movie-card"><div class="card-poster sk" style="aspect-ratio:2/3"></div><div class="card-info"><div class="sk" style="height:14px;margin-bottom:8px"></div><div class="sk" style="height:12px;width:60%"></div></div></div>`).join('');
      const data = await tmdb(`/tv/${type}?language=en-US&page=1`);
      const shows = (data.results || []).slice(0, 20);

      // Fetch full show details in parallel to get last_episode_to_air
      // (list endpoints don't include this field — only the /tv/{id} detail endpoint does)
      const details = await Promise.all(
        shows.map(s => tmdb(`/tv/${s.id}?language=en-US`).catch(() => null))
      );
      const showDetails = shows.map((s, i) => details[i]
        ? { 
            ...s, 
            last_episode_to_air: details[i].last_episode_to_air,
            next_episode_to_air: details[i].next_episode_to_air
          }
        : s
      );

      const watchDatas = await Promise.all(shows.map(s => getWatch(s.id, 'tv')));
      currentTV = showDetails;
      grid.innerHTML = showDetails.map((s, i) => buildCard(s, null, 'tv', watchDatas[i])).join('');
      animateGrid(grid);
      addCardListeners(grid, '.movie-card');
      const cards = grid.querySelectorAll('.movie-card');
      buildFilterBar('tvFilterBar', cards, 'all', (id) => { activeTVFilter = id; filterCards('tvGrid', id); });

    }

    async function loadTopRated() {
      const grid = document.getElementById('topRatedGrid');
      grid.innerHTML = Array.from({ length: 15 }, () => `<div class="movie-card"><div class="card-poster sk" style="aspect-ratio:2/3"></div><div class="card-info"><div class="sk" style="height:14px;margin-bottom:8px"></div><div class="sk" style="height:12px;width:60%"></div></div></div>`).join('');
      const data = await tmdb('/movie/top_rated?language=en-US&page=1');
      const movies = (data.results || []).slice(0, 20);
      const watchDatas = await Promise.all(movies.map(m => getWatch(m.id, 'movie')));
      grid.innerHTML = movies.map((m, i) => buildCard(m, i + 1, 'movie', watchDatas[i])).join('');
      animateGrid(grid);
      addCardListeners(grid, '.movie-card');

    }

    async function loadFeatured(movies) {
      if (!movies || !movies.length) return;
      const m = movies.find(x => x.backdrop_path) || movies[0];
      if (!m) return;
      const img = document.getElementById('featuredImg');
      img.src = m.backdrop_path ? `${IMG}w1280${m.backdrop_path}` : '';
      document.getElementById('featuredTitle').textContent = (m.title || m.name || '').toUpperCase();
      document.getElementById('featuredSub').textContent = (m.overview || '').slice(0, 120) + '...';
      const wd = await getWatch(m.id, 'movie');
      const fs = document.getElementById('featuredStreams');
      if (wd && wd.flatrate) {
        fs.innerHTML = wd.flatrate.slice(0, 4).map(p => { const info = getProviderInfo(p.provider_id); return `<span class="stream-pill stream-${info.cls}"><span class="stream-dot"></span>${info.name}</span>`; }).join('');
      }
      const banner = document.getElementById('featuredBanner');
      gsap.fromTo(banner,
        { opacity: 0, rotationX: 15, y: 60, scale: 0.95, transformPerspective: 1200 },
        { opacity: 1, rotationX: 0, y: 0, scale: 1, duration: 1.2, ease: 'power4.out', scrollTrigger: { trigger: banner, start: 'top 85%' } }
      );

      // 3D hover on banner
      banner.addEventListener('mousemove', e => {
        const rect = banner.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        gsap.to(banner, { rotationY: x * 6, rotationX: -y * 6, transformPerspective: 1200, duration: 0.4, ease: 'power2.out' });
        gsap.to(banner.querySelector('.featured-content'), { x: x * 20, y: y * 20, duration: 0.4, ease: 'power2.out' });
      });
      banner.addEventListener('mouseleave', () => {
        gsap.to(banner, { rotationY: 0, rotationX: 0, duration: 0.8, ease: 'elastic.out(1,0.7)' });
        gsap.to(banner.querySelector('.featured-content'), { x: 0, y: 0, duration: 0.8, ease: 'elastic.out(1,0.7)' });
      });
    }

    function updateRing(idSuffix, newVote) {
      const ring = document.getElementById(`ring-${idSuffix}`);
      if (!ring) return;
      const r = 16, circ = +(2 * Math.PI * r).toFixed(2);
      const v = parseFloat(newVote);
      const frac = (!isNaN(v) && v > 0) ? Math.min(v / 10, 1) : 0;
      const offset = +(circ * (1 - frac)).toFixed(2);
      const fg = ring.querySelector('.rating-ring-fg');
      const scoreEl = ring.querySelector('.rating-ring-score');
      if (fg) fg.style.strokeDashoffset = offset;
      if (scoreEl) scoreEl.textContent = (!isNaN(v) && v > 0) ? v.toFixed(1) : '—';
      ring.classList.remove('ring-na', 'ring-high', 'ring-mid', 'ring-low');
      ring.classList.add(isNaN(v) || v === 0 ? 'ring-na' : v >= 7.5 ? 'ring-high' : v >= 6 ? 'ring-mid' : 'ring-low');
    }



    // ── Season/Episode chooser helpers ─────────────────────────────────────
    async function loadSeasonEpisodes(tvId, season) {
      const cacheKey = `${tvId}-s${season}`;
      if (_seasonEpCache[cacheKey]) return _seasonEpCache[cacheKey];
      try {
        const d = await tmdb(`/tv/${tvId}/season/${season}`);
        const eps = (d.episodes || []).map(e => ({ number: e.episode_number, name: e.name }));
        _seasonEpCache[cacheKey] = eps;
        return eps;
      } catch { return []; }
    }

    function buildEpisodeUrl(server, id, season, episode) {
      switch (server) {
        case 1: return `https://player.videasy.net/tv/${id}/${season}/${episode}?autoplay=1`;
        case 2: return `https://vidsrc.me/embed/tv?tmdb=${id}&season=${season}&episode=${episode}&autoplay=1`;
        case 3: return `https://vidfast.pro/tv/${id}/${season}/${episode}?autoplay=1`;
        case 4: return `https://embedmaster.link/tv/${id}/${season}/${episode}?autoplay=1`;
        case 5: return `https://vidcore.net/tv/${id}/${season}/${episode}?autoplay=1&server=orbit`;
        default: return `https://player.videasy.net/tv/${id}/${season}/${episode}?autoplay=1`;
      }
    }

    function getModalServerUrls(id, type, season, episode) {
      if (type === 'tv') {
        return [
          buildEpisodeUrl(1, id, season, episode),
          buildEpisodeUrl(2, id, season, episode),
          buildEpisodeUrl(3, id, season, episode),
          buildEpisodeUrl(4, id, season, episode),
          buildEpisodeUrl(5, id, season, episode),
        ];
      }
      return [
        `https://player.videasy.net/movie/${id}?autoplay=1`,
        `https://vidsrc.me/embed/movie?tmdb=${id}&autoplay=1`,
        `https://vidfast.pro/movie/${id}?autoplay=1`,
        `https://embedmaster.link/movie/${id}?autoplay=1`,
        `https://vidcore.net/movie/${id}?autoplay=1&server=orbit`,
      ];
    }

    function refreshModalPlayButtons() {
      const id = _currentModalId;
      const type = _currentModalType;
      if (!id) return;
      const s = _selectedSeason, e = _selectedEpisode;
      const allUrls = getModalServerUrls(id, type, s, e);
      const allLabels = ['▶ Server 1', '▶ Server 2', '▶ Server 3', '▶ Server 4', '▶ Server 5'];
      const colors = ['var(--green)', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444'];
      const textColors = ['#fff', '#fff', '#fff', '#07090F', '#fff'];
      const btns = document.querySelectorAll('.modal-play-btn');
      btns.forEach((btn, i) => {
        btn.onclick = () => playStream(allUrls[i], allUrls, allLabels);
      });
    }

    async function setupEpChooser(tvId, numSeasons) {
      const chooser = document.getElementById('modalEpChooser');
      const seasonSel = document.getElementById('epSeasonSelect');
      const episodeSel = document.getElementById('epEpisodeSelect');
      const hint = document.getElementById('epHint');

      chooser.style.display = 'block';
      seasonSel.innerHTML = '<option value="">Season…</option>';
      for (let s = 1; s <= numSeasons; s++) {
        seasonSel.innerHTML += `<option value="${s}">Season ${s}</option>`;
      }

      // Default to season 1
      seasonSel.value = '1';
      _selectedSeason = 1;
      _selectedEpisode = 1;

      async function populateEpisodes(season) {
        episodeSel.disabled = true;
        episodeSel.innerHTML = '<option value="">Loading…</option>';
        hint.textContent = '';
        const eps = await loadSeasonEpisodes(tvId, season);
        episodeSel.innerHTML = '<option value="">Episode…</option>';
        eps.forEach(ep => {
          episodeSel.innerHTML += `<option value="${ep.number}">Ep ${ep.number}${ep.name ? ' — ' + ep.name : ''}</option>`;
        });
        if (eps.length) {
          episodeSel.value = '1';
          _selectedEpisode = 1;
          hint.textContent = `${eps.length} episode${eps.length !== 1 ? 's' : ''} in this season`;
        }
        episodeSel.disabled = false;
        refreshModalPlayButtons();
      }

      await populateEpisodes(1);

      seasonSel.onchange = async () => {
        const s = parseInt(seasonSel.value);
        if (!s) return;
        _selectedSeason = s;
        await populateEpisodes(s);
      };

      episodeSel.onchange = () => {
        const ep = parseInt(episodeSel.value);
        if (!ep) return;
        _selectedEpisode = ep;
        refreshModalPlayButtons();
      };
    }

    // MODAL
    async function openModal(id, type = 'movie') {
      // Auto-focus close button when in TV mode so remote navigation works immediately
      setTimeout(() => {
        if (_tvMode) {
          const firstBtn = document.querySelector('#modal.open #modalClose');
          if (firstBtn) firstBtn.focus();
        }
      }, 500);
      const heroVideo = document.getElementById('heroVideoContainer');
      if (heroVideo) heroVideo.innerHTML = '';

      const modal = document.getElementById('modal');
      modal.classList.add('open');
      history.pushState({ ui: 'modal', id: id, type: type }, '', location.href);
      document.getElementById('modalTitle').textContent = 'Loading…';
      document.getElementById('modalPlot').textContent = '';
      document.getElementById('modalStreams').innerHTML = '<div class="no-stream">Checking platforms…</div>';
      document.getElementById('modalRentSection').style.display = 'none';
      document.getElementById('modalCast').textContent = '';
      document.getElementById('modalRatings').innerHTML = '';
      document.getElementById('modalMeta').innerHTML = '';
      document.getElementById('modalPoster').src = '';
      const _epInfoReset = document.getElementById('modalEpInfo');
      if (_epInfoReset) { _epInfoReset.style.display = 'none'; _epInfoReset.innerHTML = ''; }
      gsap.fromTo('#modalBox', { scale: .92, opacity: 0, y: 30 }, { scale: 1, opacity: 1, y: 0, duration: .45, ease: 'power3.out' });

      try {
        const [details, watchData, credits, videoData] = await Promise.all([
          tmdb(`/${type}/${id}?language=en-US`),
          getWatch(id, type),
          getCredits(id, type),
          tmdb(`/${type}/${id}/videos?language=en-US`)
        ]);
        _currentModalItem = details;
        const title = details.title || details.name || '';
        const year = (details.release_date || details.first_air_date || '').slice(0, 4);
        const poster = details.poster_path ? `${IMG}w500${details.poster_path}` : '';
        document.getElementById('modalType').textContent = type === 'movie' ? 'Movie' : 'TV Show';
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalPoster').src = poster;
        document.getElementById('modalMeta').innerHTML = `
      <span>${year}</span>
      ${details.runtime ? `<span>· ${details.runtime} min</span>` : ''}
      ${details.number_of_seasons ? `<span>· ${details.number_of_seasons} Season${details.number_of_seasons > 1 ? 's' : ''}</span>` : ''}
      ${details.vote_average ? `<span>· ★ ${details.vote_average.toFixed(1)}</span>` : ''}
      ${(details.genres || []).slice(0, 2).map(g => `<span style="background:rgba(232,201,122,0.1);color:var(--gold);padding:.15rem .5rem;border-radius:4px;font-size:.72rem">${g.name}</span>`).join('')}
    `;
        
        const shareBtn = document.getElementById('modalShare');
        if (shareBtn) {
          shareBtn.className = 'modal-share-icon-btn';
          shareBtn.onclick = () => {
            const shortCode = type === 'tv' ? 'tv' : 'm';
            const slug = slugify(title);
            const fullId = slug ? `${id}-${slug}` : id;
            const shareUrl = `${window.location.origin}${window.location.pathname}?${shortCode}=${fullId}`;
            navigator.clipboard.writeText(shareUrl).then(() => {
              shareBtn.classList.add('copied');
              setTimeout(() => {
                shareBtn.classList.remove('copied');
              }, 2000);
            }).catch(err => {
              console.error('Failed to copy', err);
            });
          };
        }
        let trailerKey = null;
        if (videoData && videoData.results) {
          const trailer = videoData.results.find(v => v.site === 'YouTube' && v.type === 'Trailer') || videoData.results.find(v => v.site === 'YouTube');
          if (trailer) trailerKey = trailer.key;
        }
        const trailerBtn = trailerKey ? `<button class="rating-badge" style="background:#E50914;color:#fff;border:none;cursor:pointer;margin-left:0.5rem" onclick="playStream('https://www.youtube.com/embed/${trailerKey}?autoplay=1')">🎬 Watch Trailer</button>` : '';

        document.getElementById('modalRatings').innerHTML = `
      <div class="rating-badge imdb-badge" id="modal-imdb">⭐ ${details.vote_average ? details.vote_average.toFixed(1) : '—'} TMDB</div>
      ${trailerBtn}
    `;
        document.getElementById('modalPlot').textContent = details.overview || 'No description available.';

        // Episode info panel (TV shows only)
        const epInfoEl = document.getElementById('modalEpInfo');
        if (epInfoEl) {
          if (type === 'tv') {
            const lastEp  = details.last_episode_to_air  || null;
            const nextEp  = details.next_episode_to_air  || null;

            function fmtDate(d) {
              if (!d) return null;
              const dt = new Date(d);
              return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
            }

            let epHtml = `<div style="display:flex;flex-wrap:wrap;gap:.65rem;margin-bottom:.2rem">`;

            if (lastEp) {
              const aired = fmtDate(lastEp.air_date);
              const sixDaysMs = 6 * 24 * 60 * 60 * 1000;
              const isNew = lastEp.air_date && (Date.now() - new Date(lastEp.air_date).getTime()) <= sixDaysMs;
              epHtml += `
                <div style="flex:1;min-width:180px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:10px;padding:.75rem 1rem;position:relative;overflow:hidden">
                  <div style="font-size:.62rem;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin-bottom:.4rem">Last Episode</div>
                  <div style="font-size:.85rem;font-weight:700;color:var(--text);margin-bottom:.2rem">
                    S${lastEp.season_number} E${lastEp.episode_number}${lastEp.name ? ' — ' + lastEp.name : ''}
                  </div>
                  <div style="font-size:.72rem;color:var(--muted)">${aired || '—'}</div>
                  ${isNew ? `<div style="position:absolute;top:8px;right:8px"><div class="badge-new-episode mini">✦ New Ep</div></div>` : ''}
                </div>`;
            }

            if (nextEp) {
              const airsOn = fmtDate(nextEp.air_date);
              epHtml += `
                <div style="flex:1;min-width:180px;background:rgba(39,174,96,0.06);border:1px solid rgba(39,174,96,0.2);border-radius:10px;padding:.75rem 1rem">
                  <div style="font-size:.62rem;letter-spacing:1.5px;text-transform:uppercase;color:#27AE60;margin-bottom:.4rem">Next Episode</div>
                  <div style="font-size:.85rem;font-weight:700;color:var(--text);margin-bottom:.2rem">
                    S${nextEp.season_number} E${nextEp.episode_number}${nextEp.name ? ' — ' + nextEp.name : ''}
                  </div>
                  <div style="font-size:.72rem;color:#27AE60">🗓 Airs ${airsOn || 'TBA'}</div>
                </div>`;
            }

            if (!lastEp && !nextEp) {
              epHtml += `<div style="font-size:.8rem;color:var(--muted)">Episode schedule not available.</div>`;
            }

            epHtml += `</div>`;
            epInfoEl.innerHTML = epHtml;
            epInfoEl.style.display = 'block';
          } else {
            epInfoEl.style.display = 'none';
            epInfoEl.innerHTML = '';
          }
        }

        // Streaming
        const flat = watchData && watchData.flatrate ? watchData.flatrate : [];
        const rent = watchData && watchData.rent ? watchData.rent : [];
        const buy = watchData && watchData.buy ? watchData.buy : [];
        document.getElementById('modalStreams').innerHTML = buildModalStreamPills(flat, rent);
        if (rent.length || buy.length) {
          document.getElementById('modalRentSection').style.display = 'block';
          const rentBuy = [...rent, ...buy].filter((v, i, a) => a.findIndex(x => x.provider_id === v.provider_id) === i);
          document.getElementById('modalRent').innerHTML = buildRentPills(rentBuy);
        }

        // Cast
        const cast = (credits && credits.cast ? credits.cast : []).slice(0, 6).map(c => c.name).join(', ');
        document.getElementById('modalCast').textContent = cast || 'Cast information unavailable';

        // Setup modal state and play buttons
        try {
          const imdbId = details.imdb_id || await getImdbId(id, type);
          const ms = document.getElementById('modalStreams');

          // Set modal state
          _currentModalId = id;
          _currentModalType = type;
          _selectedSeason = 1;
          _selectedEpisode = 1;
          _totalSeasons = (type === 'tv' && details.number_of_seasons) ? details.number_of_seasons : 0;

          const allUrls = getModalServerUrls(id, type, 1, 1);
          const allLabels = ['▶ Server 1', '▶ Server 2', '▶ Server 3', '▶ Server 4', '▶ Server 5'];
          const colors = ['var(--green)', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444'];
          const textColors = ['#fff', '#fff', '#fff', '#07090F', '#fff'];

          let playBtnsHtml = allUrls.map((u, i) =>
            `<button class="modal-stream-pill modal-play-btn" data-server="${i}" style="background:${colors[i]};color:${textColors[i]};border:none;margin-right:0.5rem;margin-bottom:0.3rem;cursor:pointer">${allLabels[i]}</button>`
          ).join('');

          if (ms.innerHTML.includes('no-stream')) {
            ms.innerHTML = playBtnsHtml;
          } else {
            ms.innerHTML = playBtnsHtml + ms.innerHTML;
          }

          // Wire up play buttons
          ms.querySelectorAll('.modal-play-btn').forEach((btn, i) => {
            btn.onclick = () => {
              const urls = getModalServerUrls(_currentModalId, _currentModalType, _selectedSeason, _selectedEpisode);
              playStream(urls[i], urls, allLabels);
            };
          });

          // Setup season/episode chooser for TV shows
          const epChooser = document.getElementById('modalEpChooser');
          epChooser.style.display = 'none';
          if (type === 'tv' && details.number_of_seasons) {
            await setupEpChooser(id, details.number_of_seasons);
          }
        } catch { }
      } catch (e) {
        document.getElementById('modalTitle').textContent = 'Failed to load';
        document.getElementById('modalPlot').textContent = 'Could not fetch details. Please try again.';
      }
    }

    document.getElementById('modalClose').addEventListener('click', () => {
      if (history.state && history.state.ui === 'modal') {
        history.back();
      } else {
        closeModalInternal();
      }
    });

    function closeModalInternal() {
      gsap.to('#modalBox', {
        scale: 0.92, opacity: 0, y: 20, duration: 0.3, ease: 'power3.in', onComplete: () => {
          document.getElementById('modal').classList.remove('open');
          document.getElementById('modalFrame')?.remove();
          // Resume hero rotation and YT background if we are at the top
          if (window.scrollY < 300) {
            heroTimer = setInterval(() => setHero((heroIdx + 1) % heroMovies.length), 15000);
            if (ytPlayer && typeof ytPlayer.playVideo === 'function') {
              try { ytPlayer.playVideo(); } catch (e) { }
            }
          }
          // Reset chooser
          _currentModalId = null;
          document.getElementById('modalEpChooser').style.display = 'none';
        }
      });
    }
    document.getElementById('modal').addEventListener('click', e => {
      if (e.target === document.getElementById('modal')) document.getElementById('modalClose').click();
    });



    function playStream(url, allUrls, labels) {
      if (_currentModalItem) saveRecentWatch(_currentModalItem, _currentModalType);
      // Stop background video
      const heroVideo = document.getElementById('heroVideoContainer');
      if (heroVideo) heroVideo.innerHTML = '';

      const overlay = document.getElementById('playerOverlay');
      const frame = document.getElementById('playerFrame');
      const bar = document.getElementById('playerServerBar');
      const epBar = document.getElementById('playerEpBar');
      const loader = document.getElementById('playerLoading');
      const isTvPlay = _currentModalType === 'tv';
      if (epBar) {
        if (isTvPlay) { epBar.classList.add('visible'); }
        else { epBar.classList.remove('visible'); }
      }

      if (loader) loader.style.opacity = '1';
      if (frame) {
        frame.style.opacity = '0';
        frame.onload = () => {
          if (loader) loader.style.opacity = '0';
          frame.style.opacity = '1';
        };
        frame.src = url;
      }
      // Build server switcher
      if (allUrls && allUrls.length) {
        bar.innerHTML = allUrls.map((u, i) => {
          const lbl = labels ? labels[i] : `Server ${i + 1}`;
          return `<button class="player-server-btn${u === url ? ' active' : ''}" onclick="_activeServerIndex=${i}; switchServer('${u}', this)">${lbl}</button>`;
        }).join('');
        // Track which server is currently active
        _activeServerIndex = allUrls.indexOf(url);
        if (_activeServerIndex < 0) _activeServerIndex = 0;
      } else {
        bar.innerHTML = '';
      }
      overlay.classList.add('open');
      // Push history recovery state — if an ad redirects the page, pressing Back
      // will trigger popstate and auto-reopen this video.
      if (typeof window._adblock_pushRecovery === 'function') window._adblock_pushRecovery(url);
      


      // Auto fullscreen if possible (helpful for all devices)
      const pContainer = document.getElementById('playerContainer');
      if (pContainer) {
        try {
          if (pContainer.requestFullscreen) pContainer.requestFullscreen().catch(() => {});
          else if (pContainer.webkitRequestFullscreen) pContainer.webkitRequestFullscreen();
        } catch (e) {}
      }

      gsap.fromTo('.player-container', { scale: 0.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: 'power3.out' });
      // TV remote: auto-focus the UI buttons so the user isn't trapped in the cross-origin iframe!
      if (_tvMode) {
        setTimeout(() => {
          const focusTarget = document.getElementById('playerPrevEp')?.offsetParent
            ? document.getElementById('playerPrevEp')
            : document.getElementById('playerClose');
          if (focusTarget) focusTarget.focus();
        }, 450);
      }
      if (isTvPlay) {
        updateEpNavButtons();
      }
    }

    function switchServer(url, btn) {
      document.querySelectorAll('.player-server-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const frame = document.getElementById('playerFrame');
      const loader = document.getElementById('playerLoading');
      if (loader) loader.style.opacity = '1';
      if (frame) {
        frame.style.opacity = '0';
        frame.src = url;
        if (typeof window._adblock_pushRecovery === 'function') window._adblock_pushRecovery(url);
      }
    }

    document.getElementById('playerClose').addEventListener('click', () => {
      if (history.state && (history.state.ui === 'player' || history.state._hackyMaxPlayer)) {
        history.back();
      } else {
        closePlayerInternal();
      }
    });

    function closePlayerInternal() {
      gsap.to('.player-container', {
        scale: 0.9, opacity: 0, duration: 0.3, ease: 'power3.in', onComplete: () => {
          document.getElementById('playerOverlay').classList.remove('open');
          document.getElementById('playerFrame').src = '';
          const epBar = document.getElementById('playerEpBar');
          if (epBar) epBar.classList.remove('visible');
        }
      });
    }

    document.getElementById('playerOverlay').addEventListener('click', e => {
      if (e.target === document.getElementById('playerOverlay')) document.getElementById('playerClose').click();
    });

    // ─── AD / REDIRECT BLOCKER (multi-layer) ─────────────────────────────────
    (function () {
      'use strict';

      function isPlayerOpen() {
        return !!document.getElementById('playerOverlay')?.classList.contains('open');
      }

      // ── Layer 1: window.open override ────────────────────────────────────────
      // Blocks popup/new-tab ads spawned by the iframe while the player is open.
      const _origOpen = window.open.bind(window);
      window._safeOpen = _origOpen;
      window.open = function (url, target, features) {
        if (url && (url.includes('youtube.com') || url.includes('youtu.be'))) {
          return _origOpen(url, target, features);   // allow trailer links
        }
        if (isPlayerOpen()) {
          console.warn('[AdBlock] Blocked popup:', url);
          return null;
        }
        return _origOpen(url, target, features);
      };

      // ── Layer 2: location.assign / location.replace intercept ────────────────
      // Catches iframes calling window.top.location.assign("adUrl")
      try {
        const _origAssign  = window.location.assign.bind(window.location);
        const _origReplace = window.location.replace.bind(window.location);
        window.location.assign = function (url) {
          if (isPlayerOpen()) { console.warn('[AdBlock] Blocked assign:', url); return; }
          _origAssign(url);
        };
        window.location.replace = function (url) {
          if (isPlayerOpen()) { console.warn('[AdBlock] Blocked replace:', url); return; }
          _origReplace(url);
        };
      } catch (e) { /* security error in some browsers — safe to ignore */ }

      // ── Layer 3: beforeunload guard ───────────────────────────────────────────
      // Desktop: shows "Leave page?" dialog so user can cancel the redirect.
      // Mobile: many browsers honour preventDefault() and cancel navigation.
      window.addEventListener('beforeunload', function (e) {
        if (isPlayerOpen()) {
          e.preventDefault();
          e.returnValue = '';   // Chrome requires this
        }
      });

      // ── Layer 4: blur → refocus (desktop + some mobile browsers) ─────────────
      let _blurTimer = null;
      window.addEventListener('blur', function () {
        if (!isPlayerOpen()) return;
        _blurTimer = setTimeout(function () { try { window.focus(); } catch (e) {} }, 80);
      });
      window.addEventListener('focus', function () {
        clearTimeout(_blurTimer);
      });

      // ── Layer 5: visibilitychange (mobile-specific) ────────────────────────────
      // On mobile, when a new tab opens the page goes hidden. Detect this and try
      // to pull focus back. If the browser already navigated away, the history
      // recovery state (layer 6) brings them back.
      let _visTimer = null;
      document.addEventListener('visibilitychange', function () {
        if (!isPlayerOpen()) return;
        if (document.hidden) {
          _visTimer = setTimeout(function () {
            try { window.focus(); } catch (e) {}
          }, 150);
        } else {
          clearTimeout(_visTimer);
        }
      });

      // ── Layer 6: history recovery state ───────────────────────────────────────
      // Push a tagged state so that if a redirect DOES succeed, pressing Back
      // lands the user right back here with the player ready to re-open.
      window._adblock_pushRecovery = function (iframeSrc) {
        try {
          if (history.state && (history.state.ui === 'player' || history.state._hackyMaxPlayer)) {
            history.replaceState({ ui: 'player', _hackyMaxPlayer: true, _src: iframeSrc }, '', location.href);
          } else {
            history.pushState({ ui: 'player', _hackyMaxPlayer: true, _src: iframeSrc }, '', location.href);
          }
        } catch (e) {}
      };

      window.addEventListener('popstate', function (e) {
        const state = e.state || {};
        
        // Handle Player
        const playerOverlay = document.getElementById('playerOverlay');
        const frame = document.getElementById('playerFrame');
        if (state.ui === 'player' || state._hackyMaxPlayer) {
          // User navigated forward back to the player, or an ad redirect popped
          history.replaceState(state, '', location.href);
          if (playerOverlay && frame && state._src && state._src !== 'about:blank') {
            frame.src = state._src;
            playerOverlay.classList.add('open');
            try { gsap.fromTo('.player-container', { scale: 0.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: 'power3.out' }); } catch (ex) {}
          }
        } else {
          // Hardware back button pressed, close player if open
          if (playerOverlay && playerOverlay.classList.contains('open')) {
            closePlayerInternal();
          }
        }

        // Handle Modal
        const modal = document.getElementById('modal');
        if (state.ui === 'modal') {
           if (modal && !modal.classList.contains('open')) {
              modal.classList.add('open');
              try { gsap.fromTo('#modalBox', { scale: 0.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3 }); } catch(ex){}
           }
        } else if (state.ui !== 'player') {
           if (modal && modal.classList.contains('open')) {
              closeModalInternal();
           }
        }
      });

      // ── Layer 7: MutationObserver on iframe src ────────────────────────────────
      // Last resort: if the iframe's src attribute itself gets swapped to an ad URL,
      // restore the real video URL.
      const _frame = document.getElementById('playerFrame');
      let _validSrc = '';
      if (_frame) {
        const _obs = new MutationObserver(function () {
          const cur = _frame.getAttribute('src') || '';
          if (cur && cur !== 'about:blank' && cur !== _validSrc) {
            // A new legit URL was set — record it
            _validSrc = cur;
          }
        });
        _obs.observe(_frame, { attributes: true, attributeFilter: ['src'] });
      }
    })();

    // ── Hero & YT trailer: pause/resume when the tab is hidden ────────────────
    // This prevents the hero rotation timer and YouTube background video from
    // draining battery and data while the user is on a different tab.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        // Tab hidden — stop hero rotation and pause YT playback
        clearInterval(heroTimer);
        if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
          try { ytPlayer.pauseVideo(); } catch (e) {}
        }
      } else {
        // Tab visible again — resume only if no overlay is open
        const mOpen = document.getElementById('modal')?.classList.contains('open');
        const pOpen = document.getElementById('playerOverlay')?.classList.contains('open');
        const sOpen = document.getElementById('searchOverlay')?.classList.contains('open');
        if (!mOpen && !pOpen && !sOpen && heroMovies.length) {
          heroTimer = setInterval(() => setHero((heroIdx + 1) % heroMovies.length), 15000);
          if (ytPlayer && typeof ytPlayer.playVideo === 'function') {
            try { ytPlayer.playVideo(); } catch (e) {}
          }
        }
      }
    });

    let _activeServerIndex = 0;      // which server the user last picked
    let _totalEpisodesInSeason = 0;
    let _totalSeasons = 0;

    document.getElementById('playerNextEp').addEventListener('click', () => {
      playNextEpisode();
    });
    document.getElementById('playerPrevEp').addEventListener('click', () => {
      playPrevEpisode();
    });

    function getNextEpInfo() {
      const episodeSel = document.getElementById('epEpisodeSelect');
      const seasonSel = document.getElementById('epSeasonSelect');
      const totalEps = episodeSel ? episodeSel.options.length - 1 : 0; // -1 for placeholder
      const nextEp = _selectedEpisode + 1;
      const nextSeason = _selectedSeason + 1;
      if (nextEp <= totalEps) {
        return { season: _selectedSeason, episode: nextEp, label: `S${_selectedSeason} E${nextEp}` };
      } else if (nextSeason <= _totalSeasons) {
        return { season: nextSeason, episode: 1, label: `S${nextSeason} E1`, newSeason: true };
      }
      return null; // no next episode
    }

    function getPrevEpInfo() {
      const prevEp = _selectedEpisode - 1;
      const prevSeason = _selectedSeason - 1;
      if (prevEp >= 1) {
        return { season: _selectedSeason, episode: prevEp };
      } else if (prevSeason >= 1) {
        return { season: prevSeason, episode: null }; // null = last ep of that season
      }
      return null;
    }

    async function playNextEpisode() {
      const next = getNextEpInfo();
      if (!next) return;

      if (next.newSeason) {
        // Need to reload the season dropdown first
        const seasonSel = document.getElementById('epSeasonSelect');
        const episodeSel = document.getElementById('epEpisodeSelect');
        if (seasonSel) {
          seasonSel.value = String(next.season);
          seasonSel.dispatchEvent(new Event('change'));
          // Wait for episodes to load then play ep 1
          await new Promise(resolve => setTimeout(resolve, 800));
        }
        _selectedSeason = next.season;
        _selectedEpisode = 1;
      } else {
        _selectedSeason = next.season;
        _selectedEpisode = next.episode;
        // Update select UI
        const episodeSel = document.getElementById('epEpisodeSelect');
        if (episodeSel) episodeSel.value = String(next.episode);
      }

      const urls = getModalServerUrls(_currentModalId, _currentModalType, _selectedSeason, _selectedEpisode);
      const allLabels = ['▶ Server 1', '▶ Server 2', '▶ Server 3', '▶ Server 4', '▶ Server 5'];
      playStream(urls[_activeServerIndex], urls, allLabels);
      updateEpNavButtons();
    }

    async function playPrevEpisode() {
      const prev = getPrevEpInfo();
      if (!prev) return;

      if (prev.episode === null) {
        // Go to last ep of previous season
        const seasonSel = document.getElementById('epSeasonSelect');
        if (seasonSel) {
          seasonSel.value = String(prev.season);
          seasonSel.dispatchEvent(new Event('change'));
          await new Promise(resolve => setTimeout(resolve, 800));
        }
        const episodeSel = document.getElementById('epEpisodeSelect');
        const totalEps = episodeSel ? episodeSel.options.length - 1 : 1;
        _selectedSeason = prev.season;
        _selectedEpisode = totalEps;
        if (episodeSel) episodeSel.value = String(totalEps);
      } else {
        _selectedSeason = prev.season;
        _selectedEpisode = prev.episode;
        const episodeSel = document.getElementById('epEpisodeSelect');
        if (episodeSel) episodeSel.value = String(prev.episode);
      }

      const urls = getModalServerUrls(_currentModalId, _currentModalType, _selectedSeason, _selectedEpisode);
      const allLabels = ['▶ Server 1', '▶ Server 2', '▶ Server 3', '▶ Server 4', '▶ Server 5'];
      playStream(urls[_activeServerIndex], urls, allLabels);
      updateEpNavButtons();
    }

    function updateEpNavButtons() {
      const nextInfo = getNextEpInfo();
      const prevInfo = getPrevEpInfo();
      const nextBtn = document.getElementById('playerNextEp');
      const prevBtn = document.getElementById('playerPrevEp');
      if (nextBtn) nextBtn.style.opacity = nextInfo ? '1' : '0.3';
      if (prevBtn) prevBtn.style.opacity = prevInfo ? '1' : '0.3';
    }



    function animateGrid(grid) {
      gsap.fromTo(grid.children,
        { opacity: 0, y: 50, rotationX: 25, scale: .9, transformPerspective: 1000, transformOrigin: 'top center' },
        { opacity: 1, y: 0, rotationX: 0, scale: 1, duration: .65, stagger: .08, ease: 'back.out(1.2)', scrollTrigger: { trigger: grid, start: 'top 85%' } }
      );
    }

    function addCardListeners(container, selector) {
      // Read accent color once per batch — avoids getComputedStyle on every mousemove
      let _cachedAccent1 = getComputedStyle(document.documentElement).getPropertyValue('--accent1').trim() || '232,201,122';
      // Refresh cache when hero changes accent (fired from applyDynamicColors)
      const _accentObserver = new MutationObserver(() => {
        _cachedAccent1 = getComputedStyle(document.documentElement).getPropertyValue('--accent1').trim() || '232,201,122';
      });
      _accentObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });

      container.querySelectorAll(selector).forEach(card => {
        // ── Inject WishList button (safe DOM method — no template literal issues) ──
        if (!card.querySelector('.card-wishlist-btn')) {
          const cardId = card.dataset.id;
          const cardType = card.dataset.type || 'movie';
          const poster = card.querySelector('.card-poster');
          if (cardId && poster) {
            const wlBtn = document.createElement('button');
            wlBtn.className = 'card-wishlist-btn' + (isInWishlist(cardId) ? ' wishlisted' : '');
            wlBtn.title = isInWishlist(cardId) ? 'Remove from WishList' : 'Add to WishList';
            wlBtn.textContent = '🔖';
            wlBtn.setAttribute('data-wl-id', cardId);
            wlBtn.setAttribute('data-wl-type', cardType);
            wlBtn.addEventListener('click', e => {
              e.stopPropagation();
              const titleEl = card.querySelector('.card-title');
              const subEl  = card.querySelector('.card-sub');
              const imgEl  = card.querySelector('.card-poster img');
              const posterPath = imgEl ? (imgEl.src || '').replace(/.*\/t\/p\/w\d+/, '') : null;
              const item = {
                id: cardId,
                type: cardType,
                title: titleEl ? titleEl.textContent.trim() : '',
                poster_path: posterPath || null,
                release_date: subEl ? subEl.textContent.trim() : null,
                vote_average: 0
              };
              toggleWishlist(cardId, cardType, item, wlBtn);
            });
            poster.appendChild(wlBtn);
          }
        }

        // RAF throttle: at most one tilt update per animation frame per card
        let _cardRaf = null;
        card.addEventListener('mousemove', e => {
          if (_cardRaf) return;
          _cardRaf = requestAnimationFrame(() => {
            _cardRaf = null;
            const rect = card.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width - .5;
            const y = (e.clientY - rect.top) / rect.height - .5;
            gsap.to(card, { rotationY: x * 14, rotationX: -y * 14, transformPerspective: 900, transformOrigin: 'center', duration: .3, ease: 'power2.out' });
            gsap.to(card, { boxShadow: `${-x * 25}px ${-y * 25}px 50px rgba(${_cachedAccent1},0.12), 0 0 40px rgba(${_cachedAccent1},0.06)`, duration: .3 });
          });
        }, { passive: true });
        card.addEventListener('mouseleave', () => {
          if (_cardRaf) { cancelAnimationFrame(_cardRaf); _cardRaf = null; }
          gsap.to(card, { rotationY: 0, rotationX: 0, boxShadow: '0 4px 24px rgba(0,0,0,0.35)', duration: .6, ease: 'elastic.out(1,.75)' });
        });
        card.addEventListener('click', () => {
          gsap.to(card, { scale: .95, duration: .1, yoyo: true, repeat: 1 });
          spawnParticles(card);
          const id = card.dataset.id;
          const type = card.dataset.type || 'movie';
          if (id) {
            closeSearch();
            openModal(id, type);
          }
        });
      });
    }

    function spawnParticles(el) {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      const a1 = getComputedStyle(document.documentElement).getPropertyValue('--accent1').trim() || '232,201,122';
      for (let i = 0; i < 10; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const sz = 3 + Math.random() * 7;
        p.style.cssText = `width:${sz}px;height:${sz}px;left:${cx}px;top:${cy}px;opacity:0;pointer-events:none;background:rgb(${a1})`;
        document.body.appendChild(p);
        gsap.to(p, { x: (Math.random() - .5) * 130, y: (Math.random() - .5) * 130 - 50, opacity: .9, duration: .12, onComplete: () => gsap.to(p, { opacity: 0, duration: .7, onComplete: () => p.remove() }) });
      }
    }

    // ─── DOMINANT COLOR EXTRACTION ───────────────────────────────────────────
    function extractColors(imgEl) {
      return new Promise(resolve => {
        const canvas = document.createElement('canvas');
        const SIZE = 40;
        canvas.width = SIZE; canvas.height = SIZE;
        const ctx = canvas.getContext('2d');
        try {
          ctx.drawImage(imgEl, 0, 0, SIZE, SIZE);
          const data = ctx.getImageData(0, 0, SIZE, SIZE).data;
          // Sample pixels and bucket by hue to find dominant vivid color
          let bestSat = 0, bestR = 232, bestG = 201, bestB = 122;
          let secBestSat = 0, secR = 100, secG = 60, secB = 180;
          for (let i = 0; i < data.length; i += 16) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            const sat = max === 0 ? 0 : (max - min) / max;
            const brightness = (r + g + b) / 3;
            if (sat > 0.25 && brightness > 30 && brightness < 230) {
              if (sat > bestSat) {
                secBestSat = bestSat; secR = bestR; secG = bestG; secB = bestB;
                bestSat = sat; bestR = r; bestG = g; bestB = b;
              } else if (sat > secBestSat) {
                secBestSat = sat; secR = r; secG = g; secB = b;
              }
            }
          }
          resolve({ c1: [bestR, bestG, bestB], c2: [secR, secG, secB] });
        } catch { resolve({ c1: [232, 201, 122], c2: [100, 60, 180] }); }
      });
    }

    async function applyDynamicColors(imgElOrSrc) {
      if (!imgElOrSrc) return;
      try {
        let img;
        if (typeof imgElOrSrc === 'string') {
          // Fallback: create a new Image only when given a URL string
          img = new Image();
          // No crossOrigin — TMDB images block CORS; canvas will fail silently
          img.src = imgElOrSrc;
          await new Promise(r => { img.onload = r; img.onerror = r; });
        } else {
          // Preferred path: reuse the already-loaded <img> element — zero extra download
          img = imgElOrSrc;
        }
        const { c1, c2 } = await extractColors(img);
        const root = document.documentElement.style;
        root.setProperty('--accent1', `${c1[0]}, ${c1[1]}, ${c1[2]}`);
        root.setProperty('--accent2', `${c2[0]}, ${c2[1]}, ${c2[2]}`);
      } catch { /* CORS blocked — silently keep existing accent colors */ }
    }

    // TABS
    document.querySelectorAll('#movieTabs .tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#movieTabs .tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        gsap.fromTo(tab, { scale: .94 }, { scale: 1, duration: .25, ease: 'back.out(2)' });
        loadMovies(tab.dataset.type);
      });
    });
    document.querySelectorAll('#tvTabs .tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#tvTabs .tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        gsap.fromTo(tab, { scale: .94 }, { scale: 1, duration: .25, ease: 'back.out(2)' });
        loadTV(tab.dataset.type);
      });
    });

    // SEARCH
    const searchOverlay = document.getElementById('searchOverlay');
    document.getElementById('navSearch').addEventListener('click', openSearch);
    document.getElementById('navSearchInput').addEventListener('click', openSearch);
    document.getElementById('searchClose').addEventListener('click', closeSearch);
    function openSearch() {
      searchOverlay.classList.add('open');
      gsap.fromTo('.search-input-wrap', { y: -30, opacity: 0 }, { y: 0, opacity: 1, duration: .4, ease: 'power3.out' });
      document.getElementById('searchInput').focus();
    }
    function closeSearch() {
      gsap.to(searchOverlay, { opacity: 0, duration: .2, onComplete: () => { searchOverlay.classList.remove('open'); searchOverlay.style.opacity = ''; } });
    }
    // ─── TV REMOTE / KEYBOARD NAVIGATION ────────────────────────────────────
    // Key codes for various TV platforms:
    //   Back:  27=Escape, 8=Backspace, 10009=Samsung Tizen, 461=LG webOS, 166=Browser Back
    //   OK:    13=Enter,  32=Space
    //   Play:  415=MediaPlay, 179=MediaPlayPause, 250=Play
    const TV_BACK  = new Set([27, 8, 10009, 461, 166]);
    const TV_OK    = new Set([13, 32]);
    const TV_PLAY  = new Set([415, 179, 250]);
    const FOCUSABLE_SEL = 'button:not([disabled]), a[href], select, input, [tabindex="0"]';

    let _tvMode = false;
    function enableTvMode() {
      if (_tvMode) return;
      _tvMode = true;
      document.body.classList.add('tv-mode');
    }

    function getVisibleFocusables() {
      return [...document.querySelectorAll(FOCUSABLE_SEL)].filter(el => {
        if (el.closest('#searchOverlay:not(.open)') ||
            el.closest('#modal:not(.open)') ||
            el.closest('#playerOverlay:not(.open)')) return false;
        const r = el.getBoundingClientRect();
        // Element must have dimensions to be focusable (visible in DOM)
        return r.width > 0 && r.height > 0;
      });
    }

    function spatialNavigate(dir) {
      enableTvMode();
      const cur = document.activeElement;
      const all = getVisibleFocusables();
      if (!all.length) return;
      
      // If no valid active element, focus the hero button by default
      if (!cur || cur === document.body || !all.includes(cur)) {
        const defaultTarget = document.getElementById('heroWatch');
        if (defaultTarget && all.includes(defaultTarget)) {
          defaultTarget.focus();
        } else {
          all[0].focus();
        }
        return;
      }
      const cr = cur.getBoundingClientRect();
      const cx = cr.left + cr.width  / 2;
      const cy = cr.top  + cr.height / 2;
      let best = null, bestScore = Infinity;
      for (const el of all) {
        if (el === cur) continue;
        const r  = el.getBoundingClientRect();
        const ex = r.left + r.width  / 2;
        const ey = r.top  + r.height / 2;
        const dx = ex - cx, dy = ey - cy;
        let primary, secondary, inDir;
        if (dir === 'right') { inDir = dx > 2;  primary = dx;  secondary = Math.abs(dy); }
        if (dir === 'left')  { inDir = dx < -2; primary = -dx; secondary = Math.abs(dy); }
        if (dir === 'down')  { inDir = dy > 2;  primary = dy;  secondary = Math.abs(dx); }
        if (dir === 'up')    { inDir = dy < -2; primary = -dy; secondary = Math.abs(dx); }
        if (!inDir) continue;
        const score = primary + secondary * 1.8;
        if (score < bestScore) { bestScore = score; best = el; }
      }
      if (best) {
        best.focus();
        best.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      }
    }

    document.addEventListener('keydown', e => {
      const key = e.keyCode || e.which;

      // Arrow keys → spatial navigation
      if (key === 37) { e.preventDefault(); spatialNavigate('left');  return; }
      if (key === 38) { e.preventDefault(); spatialNavigate('up');    return; }
      if (key === 39) { e.preventDefault(); spatialNavigate('right'); return; }
      if (key === 40) { e.preventDefault(); spatialNavigate('down');  return; }

      // OK / Enter / Space → click focused element
      if (TV_OK.has(key)) {
        const el = document.activeElement;
        // Don't intercept for native input/select/textarea/iframe
        if (el && !['INPUT','SELECT','TEXTAREA','IFRAME'].includes(el.tagName)) {
          const isPlayerOpen = document.getElementById('playerOverlay')?.classList.contains('open');
          if (isPlayerOpen && el.tagName === 'BODY') {
            // Do not focus the cross-origin iframe to prevent remote trapping
            return;
          }
          e.preventDefault();
          el.click();
        }
        return;
      }

      // Media Play keys → play focused card, or first available play button
      if (TV_PLAY.has(key)) {
        const isPlayerOpen = document.getElementById('playerOverlay')?.classList.contains('open');
        if (isPlayerOpen) {
          // Do not focus iframe to prevent remote trapping
          return;
        }

        e.preventDefault();
        const el = document.activeElement;
        if (el && (el.classList.contains('movie-card') || el.classList.contains('trending-card'))) {
          el.click();
        } else {
          const btn = document.querySelector('#playerOverlay.open .modal-play-btn') ||
                      document.querySelector('#modal.open .modal-play-btn') ||
                      document.querySelector('#heroPlay[style*="flex"]') ||
                      document.querySelector('#heroWatch');
          if (btn) btn.click();
        }
        return;
      }

      // Back button → dismiss overlays in order: player → modal → search
      if (TV_BACK.has(key)) {
        // Don't intercept Escape/Backspace inside text inputs
        if (document.activeElement && ['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return;
        e.preventDefault();
        const playerOverlay = document.getElementById('playerOverlay');
        if (playerOverlay && playerOverlay.classList.contains('open')) {
          document.getElementById('playerClose').click(); return;
        }
        const modal = document.getElementById('modal');
        if (modal && modal.classList.contains('open')) {
          document.getElementById('modalClose').click(); return;
        }
        const searchOverlay2 = document.getElementById('searchOverlay');
        if (searchOverlay2 && searchOverlay2.classList.contains('open')) {
          document.getElementById('searchClose').click(); return;
        }
      }
    });

    // Show TV mode hint on first arrow key
    document.addEventListener('keydown', e => {
      if ([37,38,39,40].includes(e.keyCode) && !_tvMode) enableTvMode();
    }, { once: false });
    let searchTimer2;
    let searchRequestId = 0;
    document.getElementById('searchInput').addEventListener('input', e => {
      clearTimeout(searchTimer2);
      const q = e.target.value.trim();
      if (q.length < 2) { document.getElementById('searchResults').innerHTML = ''; return; }
      searchTimer2 = setTimeout(async () => {
        const currentReq = ++searchRequestId;
        const data = await tmdb(`/search/multi?query=${encodeURIComponent(q)}&language=en-US&page=1`);
        if (currentReq !== searchRequestId) return; // Prevent old search results from overwriting new ones

        const results = (data.results || []).filter(r => r.media_type !== 'person');
        const watchDatas = await Promise.all(results.map(r => getWatch(r.id, r.media_type)));
        if (currentReq !== searchRequestId) return;

        if (results.length === 0) {
          document.getElementById('searchResults').innerHTML = '<div style="color:var(--muted);text-align:center;grid-column:1/-1;padding:2rem">No results found</div>';
          return;
        }

        document.getElementById('searchResults').innerHTML = results.map((r, i) => buildCard(r, null, r.media_type, watchDatas[i])).join('');
        gsap.fromTo('#searchResults .movie-card', { opacity: 0, y: 20 }, { opacity: 1, y: 0, stagger: .05, duration: .3, ease: 'power3.out' });
        addCardListeners(document.getElementById('searchResults'), '.movie-card');
      }, 400);
    });

    // NAV SCROLL — RAF-throttled so it fires at most once per frame, not every pixel
    let _scrollRaf = null;
    window.addEventListener('scroll', () => {
      if (_scrollRaf) return;
      _scrollRaf = requestAnimationFrame(() => {
        _scrollRaf = null;
        const nav = document.getElementById('mainNav');
        nav.style.background = window.scrollY > 80 ? 'rgba(7,9,15,0.98)' : '';
        nav.style.borderBottomColor = window.scrollY > 80 ? 'rgba(255,255,255,0.07)' : 'transparent';
      });
    }, { passive: true });

    // SECTION SCROLL ANIMATIONS
    gsap.utils.toArray('section').forEach(sec => {
      const hdr = sec.querySelector('.section-header');
      if (hdr) gsap.fromTo(hdr, { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: .7, ease: 'power3.out', scrollTrigger: { trigger: sec, start: 'top 82%' } });
    });

    // HORIZONTAL SCROLL FUNCTION
    function scrollRow(id, dir) {
      const el = document.getElementById(id);
      if (!el) return;
      const scrollAmount = window.innerWidth < 768 ? window.innerWidth * 0.8 : 600;
      el.scrollBy({ left: dir * scrollAmount, behavior: 'smooth' });
    }

    // EXPAND GRID FUNCTION
    function toggleExpand(containerId, btn) {
      const container = document.getElementById(containerId);
      const wrapper = container.parentElement;

      if (container.classList.contains('expanded')) {
        container.classList.remove('expanded');
        btn.textContent = 'View all →';
        wrapper.querySelectorAll('.scroll-btn').forEach(b => b.style.display = 'flex');
        // Scroll back to start
        container.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        container.classList.add('expanded');
        btn.textContent = 'Collapse ↑';
        wrapper.querySelectorAll('.scroll-btn').forEach(b => b.style.display = 'none');
      }
    }

    // RECENTLY WATCHED
    function saveRecentWatch(item, type) {
      try {
        if (!item || !item.id) return;
        const recent = JSON.parse(localStorage.getItem('recentWatch') || '[]');
        const toSave = {
          id: item.id,
          type: type,
          title: item.title || item.name || '',
          poster_path: item.poster_path,
          release_date: item.release_date || item.first_air_date,
          vote_average: item.vote_average
        };
        const filtered = recent.filter(r => String(r.id) !== String(item.id));
        filtered.unshift(toSave);
        localStorage.setItem('recentWatch', JSON.stringify(filtered.slice(0, 10)));
        loadRecentWatch();
      } catch (e) { console.error('Error saving recent', e); }
    }

    async function loadRecentWatch() {
      try {
        const recent = JSON.parse(localStorage.getItem('recentWatch') || '[]');
        const wl = getWishlist().slice(0, 5); // up to 5 wishlist items
        
        const section = document.getElementById('recent');
        const row = document.getElementById('recentRow');
        
        if ((!recent || recent.length === 0) && wl.length === 0) {
          if (section) section.style.display = 'none';
          return;
        }
        if (section) section.style.display = 'block';
        
        // Show up to 5 recent items
        const toShowRecent = recent.slice(0, 5);
        
        // Fetch watch progress for both lists in parallel
        const [recentWatchDatas, wlWatchDatas] = await Promise.all([
          Promise.all(toShowRecent.map(r => getWatch(r.id, r.type))),
          Promise.all(wl.map(w => getWatch(w.id, w.type)))
        ]);
        
        if (row) {
          let html = toShowRecent.map((item, i) => buildCard(item, null, item.type, recentWatchDatas[i])).join('');
          
          if (wl.length > 0) {
            // Add a visual separator if there are recent items before it
            if (toShowRecent.length > 0) {
              html += `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 1.5rem;color:var(--muted);font-weight:700;white-space:nowrap;user-select:none;font-size:0.85rem;letter-spacing:1px;opacity:0.7"><span style="font-size:1.5rem;color:var(--gold);margin-bottom:0.3rem">🔖</span>WISHLIST</div>`;
            }
            html += wl.map((item, i) => buildCard(item, null, item.type, wlWatchDatas[i])).join('');
          }
          
          row.innerHTML = html;
          animateGrid(row);
          addCardListeners(row, '.movie-card');
        }
      } catch (e) {
        console.error('Error loading recent', e);
      }
    }

    // INIT
    async function init() {
      // ── Handle Shareable Links ──
      const params = new URLSearchParams(window.location.search);
      const mParam = params.get('m');
      const tvParam = params.get('tv');
      const paramVal = mParam || tvParam;
      if (paramVal) {
        const id = parseInt(paramVal, 10);
        setTimeout(() => openModal(id, tvParam ? 'tv' : 'movie'), 600);
      }

      const [nowPlaying] = await Promise.all([tmdb('/movie/now_playing?language=en-US&page=1')]);

      const heroPool = (nowPlaying.results || []).filter(m => m.backdrop_path).slice(0, 6);
      await loadHero(heroPool);
      await loadRecentWatch();

      const [, , , topRated] = await Promise.all([
        loadTrending(),
        loadMovies('now_playing'),
        loadTV('on_the_air'),
        tmdb('/movie/top_rated?language=en-US&page=1')
      ]);

      await loadTopRated();
      await loadFeatured((topRated.results || []).filter(m => m.backdrop_path));

      // Build platform overview from all loaded cards
      setTimeout(() => {
        const allCards = document.querySelectorAll('.movie-card[data-providers]');
        buildPlatformGrid(allCards);
      }, 1500);

      gsap.fromTo('#mainNav', { y: -60, opacity: 0 }, { y: 0, opacity: 1, duration: .7, delay: .2, ease: 'power3.out' });

      // Hero Background Parallax
      gsap.to('#heroBg img', {
        yPercent: 30,
        ease: 'none',
        scrollTrigger: {
          trigger: '#hero',
          start: 'top top',
          end: 'bottom top',
          scrub: true
        }
      });

      // Hero content parallax depth
      gsap.to('#heroContent', {
        yPercent: 18,
        ease: 'none',
        scrollTrigger: {
          trigger: '#hero',
          start: 'top top',
          end: 'bottom top',
          scrub: 1.5
        }
      });
    }

    init().catch(console.error);

    // ─── WISHLIST FUNCTIONS ───────────────────────────────────────────────────
    const WL_KEY = 'hackyMax_wishlist';

    function getWishlist() {
      try { return JSON.parse(localStorage.getItem(WL_KEY) || '[]'); }
      catch { return []; }
    }

    function saveWishlistData(arr) {
      try { localStorage.setItem(WL_KEY, JSON.stringify(arr)); } catch { }
    }

    function isInWishlist(id) {
      return getWishlist().some(w => String(w.id) === String(id));
    }

    function toggleWishlist(id, type, item, btnEl) {
      const wl = getWishlist();
      const idx = wl.findIndex(w => String(w.id) === String(id));
      if (idx !== -1) {
        // Remove
        wl.splice(idx, 1);
        saveWishlistData(wl);
        if (btnEl) {
          btnEl.classList.remove('wishlisted');
          btnEl.title = 'Add to WishList';
          gsap.fromTo(btnEl, { scale: 1.3 }, { scale: 1, duration: 0.3, ease: 'back.out(2)' });
        }
        showWlToast('Removed from WishList');
      } else {
        // Add
        const toSave = {
          id: item.id,
          type: type,
          title: item.title || item.name || '',
          poster_path: item.poster_path || null,
          release_date: item.release_date || item.first_air_date || null,
          vote_average: item.vote_average || 0
        };
        wl.unshift(toSave);
        saveWishlistData(wl);
        if (btnEl) {
          btnEl.classList.add('wishlisted');
          btnEl.title = 'Remove from WishList';
          gsap.fromTo(btnEl, { scale: 0.6, rotate: -15 }, { scale: 1, rotate: 0, duration: 0.5, ease: 'back.out(2.5)' });
        }
        showWlToast('🔖 Added to WishList!');
      }
      updateWishlistBadge();
      loadRecentWatch(); // Refresh the row to show the newly added/removed items
      // Re-render overlay if it's open
      if (document.getElementById('wishlistOverlay')?.classList.contains('open')) {
        renderWishlist();
      }
    }

    let _wlToastTimer = null;
    function showWlToast(msg) {
      const toast = document.getElementById('wlToast');
      if (!toast) return;
      toast.textContent = msg;
      toast.classList.add('show');
      clearTimeout(_wlToastTimer);
      _wlToastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
    }

    function updateWishlistBadge() {
      const count = getWishlist().length;
      // Nav badge
      const navBadge = document.getElementById('navWlBadge');
      if (navBadge) {
        navBadge.textContent = count > 0 ? count : '';
        navBadge.style.display = count > 0 ? 'inline-flex' : 'none';
      }
      // Continue Watching section badge
      const hdrCount = document.getElementById('wishlistHeaderCount');
      if (hdrCount) {
        hdrCount.textContent = count;
        hdrCount.classList.toggle('visible', count > 0);
      }
    }

    function openWishlist() {
      const overlay = document.getElementById('wishlistOverlay');
      if (!overlay) return;
      overlay.classList.add('open');
      history.pushState({ ui: 'wishlist' }, '', location.href);
      renderWishlist();
      gsap.fromTo('.wishlist-header', { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out' });
    }

    function closeWishlist() {
      const overlay = document.getElementById('wishlistOverlay');
      if (!overlay) return;
      gsap.to(overlay, { opacity: 0, duration: 0.25, ease: 'power2.in', onComplete: () => {
        overlay.classList.remove('open');
        overlay.style.opacity = '';
      }});
    }

    async function renderWishlist() {
      const wl = getWishlist();
      const grid = document.getElementById('wishlistGrid');
      const countBadge = document.getElementById('wishlistCountBadge');
      const clearBtn = document.getElementById('wishlistClearBtn');
      if (!grid) return;

      if (countBadge) countBadge.textContent = `${wl.length} title${wl.length !== 1 ? 's' : ''}`;
      if (clearBtn) clearBtn.style.display = wl.length > 0 ? 'inline-block' : 'none';

      if (wl.length === 0) {
        grid.innerHTML = `
          <div class="wishlist-empty" style="grid-column:1/-1">
            <div class="wishlist-empty-icon">🔖</div>
            <div>Your WishList is empty</div>
            <div style="font-size:.8rem;color:var(--muted)">Hover over any movie card and click 🔖 to save it</div>
          </div>`;
        return;
      }

      // Build cards using existing buildCard (fetches watchData too)
      grid.innerHTML = wl.map(item => {
        const poster = item.poster_path
          ? `<img src="https://image.tmdb.org/t/p/w342${item.poster_path}" alt="${item.title || item.name || ''}" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block">`
          : `<div style="width:100%;height:100%;background:var(--dark3);display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:.75rem">No Poster</div>`;
        const year = (item.release_date || '').slice(0, 4);
        return `
          <div class="movie-card" tabindex="0" role="button" aria-label="${item.title || item.name || ''}" data-id="${item.id}" data-type="${item.type}" style="position:relative;cursor:pointer">
            <div class="card-poster" style="aspect-ratio:2/3;overflow:hidden;background:var(--dark3);position:relative">
              ${poster}
              <div class="card-overlay"></div>
              <div class="card-play"><svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg></div>
              <button class="card-wishlist-btn wishlisted" title="Remove from WishList"
                data-wl-id="${item.id}"
                data-wl-type="${item.type}"
                data-wl-title="${(item.title || item.name || '').replace(/"/g, '&quot;')}"
                data-wl-poster="${item.poster_path || ''}"
                data-wl-date="${item.release_date || ''}"
                data-wl-vote="${item.vote_average || 0}"
                onclick="event.stopPropagation(); toggleWishlistBtn(this)" style="opacity:1;transform:scale(1)">🔖</button>
            </div>
            <div class="card-info">
              <div class="card-title">${item.title || item.name || 'Unknown'}</div>
              <div class="card-sub">${year || '—'}</div>
            </div>
          </div>`;
      }).join('');

      gsap.fromTo(grid.children,
        { opacity: 0, y: 30, scale: 0.93 },
        { opacity: 1, y: 0, scale: 1, duration: 0.45, stagger: 0.06, ease: 'back.out(1.4)' }
      );

      // Wire up click to open modal
      grid.querySelectorAll('.movie-card').forEach(card => {
        card.addEventListener('click', () => {
          const id = card.dataset.id;
          const type = card.dataset.type || 'movie';
          if (id) { closeWishlist(); setTimeout(() => openModal(id, type), 300); }
        });
      });
    }

    function clearWishlist() {
      if (!confirm('Clear all WishList items?')) return;
      saveWishlistData([]);
      updateWishlistBadge();
      renderWishlist();
      loadRecentWatch(); // Refresh row to remove cleared items
      showWlToast('WishList cleared');
    }

    // Wire up close button & popstate
    document.getElementById('wishlistClose')?.addEventListener('click', () => {
      if (history.state && history.state.ui === 'wishlist') history.back();
      else closeWishlist();
    });

    // Extend existing popstate handler to also close wishlist
    window.addEventListener('popstate', e => {
      if (!e.state || (e.state.ui !== 'wishlist' && e.state.ui !== 'modal' && e.state.ui !== 'player' && !e.state._hackyMaxPlayer)) {
        const wlOv = document.getElementById('wishlistOverlay');
        if (wlOv && wlOv.classList.contains('open')) closeWishlist();
      }
    });

    // Init badge on page load
    updateWishlistBadge();

    // Helper: called from card button onclick — reads item info from data-* attrs
    function toggleWishlistBtn(btn) {
      const item = {
        id: btn.dataset.wlId,
        type: btn.dataset.wlType,
        title: (btn.dataset.wlTitle || '').replace(/&quot;/g, '"'),
        poster_path: btn.dataset.wlPoster || null,
        release_date: btn.dataset.wlDate || null,
        vote_average: parseFloat(btn.dataset.wlVote) || 0
      };
      toggleWishlist(item.id, item.type, item, btn);
    }
  
